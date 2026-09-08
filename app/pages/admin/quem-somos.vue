<script setup lang="ts">
import { ABOUT_BLOCK_TYPE_LABELS, ABOUT_BLOCK_TYPES, emptyAboutBlock } from "~~/shared/models/about-page";
import type { AboutBlock, AboutBlockType } from "~~/shared/models/about-page";
import { ABOUT_BLOCKS_MAX } from "~~/shared/utils/about-content";
definePageMeta({ layout: "admin", middleware: "admin" });

// Tela própria (em vez de mais uma seção em "Meu site"): a edição aqui é por
// bloco — adicionar, reordenar, remover — um editor pequeno, não mais um grupo
// de campos. Os TIPOS de bloco (heading/text/image/stat) são só o começo: a
// ideia é ajustar/ampliar esse catálogo quando os modelos de conteúdo
// definitivos da página chegarem, sem precisar migrar dado nenhum — cada bloco
// já carrega o próprio tipo.
const { form, saving, saved, error, save: persist } = useTenantSettings(["aboutContent"]);

const blocks = computed(() => form.aboutContent?.blocks ?? []);
const newBlockType = ref<AboutBlockType>("heading");

function addBlock() {
  if (blocks.value.length >= ABOUT_BLOCKS_MAX) return;
  form.aboutContent = {
    blocks: [...blocks.value, emptyAboutBlock(newBlockType.value)],
  };
}
function removeBlock(i: number) {
  form.aboutContent = { blocks: blocks.value.filter((_, n) => n !== i) };
}
/** Setas em vez de arrastar, mesma escolha do rodapé: poucos itens, sem lib nova. */
function moveBlock(i: number, delta: number) {
  const arr = [...blocks.value];
  const j = i + delta;
  if (j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  form.aboutContent = { blocks: arr };
}

// useBrandUpload é um composable — precisa ser chamado uma vez no setup, não
// por linha do editor (a lista de blocos é dinâmica). `uploadingImageAt` guarda
// QUAL bloco está subindo para o onDone atualizar o certo.
const uploadingImageAt = ref<number | null>(null);
const { uploading: uploadingImage, onFile: onImageFile } = useBrandUpload({
  bucket: "tenant-hero",
  prefix: "about",
  maxEdge: IMAGE_SIZE_LG,
  onDone: (url) => {
    const i = uploadingImageAt.value;
    const b = i != null ? blocks.value[i] : undefined;
    if (b?.type === "image") b.url = url;
    uploadingImageAt.value = null;
  },
});
function onImagePick(i: number, e: Event) {
  uploadingImageAt.value = i;
  onImageFile(e);
}

// Wrapper sem argumento: `persist` aceita um `validate` opcional, mas o tipo
// dele não bate com o SubmitEvent que o @submit passaria direto.
const save = () => persist();

function blockLabel(b: AboutBlock): string {
  if (b.type === "heading") return b.text || "(sem título)";
  if (b.type === "text") return b.body ? b.body.slice(0, 40) + (b.body.length > 40 ? "…" : "") : "(sem texto)";
  if (b.type === "image") return b.caption || b.alt || "(sem legenda)";
  return b.label || "(sem rótulo)";
}

useHead({ title: "Quem somos · Painel" });
</script>

<template>
  <div>
    <h1>Quem somos</h1>
    <p style="color: var(--ink-soft); margin-bottom: 18px">
      Monte a página <code>/quem-somos</code> em blocos — título, texto, imagem ou
      número em destaque. Adicione, reordene e remova como quiser; o site
      mostra na mesma ordem daqui.
      <a href="/quem-somos" target="_blank" rel="noopener">Ver a página ↗</a>
    </p>

    <form class="admin-card" @submit.prevent="save">
      <div v-if="!blocks.length" class="ab-empty">
        Nenhum bloco ainda. A página <code>/quem-somos</code> existe, mas fica em
        branco até você adicionar o primeiro. Se ainda não quiser divulgá-la,
        esconda o link em "Meu site" → Páginas do seu site.
      </div>

      <div v-for="(b, i) in blocks" :key="i" class="ab-block">
        <div class="ab-block-head">
          <span class="ab-type">{{ ABOUT_BLOCK_TYPE_LABELS[b.type] }}</span>
          <span class="ab-preview">{{ blockLabel(b) }}</span>
          <div class="ab-actions">
            <button type="button" class="admin-btn ghost sm" :disabled="i === 0" @click="moveBlock(i, -1)">↑</button>
            <button
              type="button"
              class="admin-btn ghost sm"
              :disabled="i === blocks.length - 1"
              @click="moveBlock(i, 1)"
            >
              ↓
            </button>
            <button type="button" class="admin-btn danger sm" @click="removeBlock(i)">Remover</button>
          </div>
        </div>

        <div v-if="b.type === 'heading'" class="ab-fields">
          <label class="admin-label">Título</label>
          <input v-model="b.text" class="admin-input" placeholder="Ex.: Nossa história" />
        </div>

        <div v-else-if="b.type === 'text'" class="ab-fields">
          <label class="admin-label">Texto</label>
          <textarea v-model="b.body" class="admin-textarea" rows="4" placeholder="Conte a história da imobiliária..." />
        </div>

        <div v-else-if="b.type === 'image'" class="ab-fields">
          <div class="logo-row">
            <div class="hero-img-preview">
              <img v-if="b.url" :src="supabaseRenderImage(b.url, { width: 120, height: 120, quality: 70 })" alt="" />
              <AppIcon v-else name="home" />
            </div>
            <label class="admin-btn ghost file-btn">
              {{ uploadingImage && uploadingImageAt === i ? "Enviando..." : b.url ? "Trocar imagem" : "Enviar imagem" }}
              <input type="file" accept="image/*" hidden @change="onImagePick(i, $event)" />
            </label>
            <button v-if="b.url" type="button" class="admin-btn ghost" @click="b.url = ''">Remover</button>
          </div>
          <div class="form-grid" style="margin-top: 10px">
            <div>
              <label class="admin-label">Texto alternativo (acessibilidade)</label>
              <input v-model="b.alt" class="admin-input" placeholder="Ex.: Equipe da imobiliária" />
            </div>
            <div>
              <label class="admin-label">Legenda (opcional)</label>
              <input v-model="b.caption" class="admin-input" />
            </div>
          </div>
        </div>

        <div v-else-if="b.type === 'stat'" class="ab-fields form-grid">
          <div>
            <label class="admin-label">Número</label>
            <input v-model="b.value" class="admin-input" placeholder="Ex.: 20 anos" />
          </div>
          <div>
            <label class="admin-label">Legenda</label>
            <input v-model="b.label" class="admin-input" placeholder="Ex.: de mercado" />
          </div>
        </div>
      </div>

      <div class="ab-add">
        <select v-model="newBlockType" class="admin-input">
          <option v-for="t in ABOUT_BLOCK_TYPES" :key="t" :value="t">{{ ABOUT_BLOCK_TYPE_LABELS[t] }}</option>
        </select>
        <button type="button" class="admin-btn ghost" :disabled="blocks.length >= ABOUT_BLOCKS_MAX" @click="addBlock">
          + Adicionar bloco
        </button>
      </div>

      <p v-if="error" style="color: #b91c1c; margin-top: 14px">{{ error }}</p>
      <p v-if="saved" style="color: var(--wa-dark); margin-top: 14px; font-weight: 600">Salvo! ✅</p>

      <div style="margin-top: 18px">
        <button class="admin-btn" type="submit" :disabled="saving">
          {{ saving ? "Salvando..." : "Salvar" }}
        </button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.ab-empty {
  color: var(--ink-soft);
  font-size: 14px;
  padding: 14px 0;
}
.ab-block {
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 14px;
  margin-bottom: 14px;
}
.ab-block-head {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}
.ab-type {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--brand);
  background: var(--brand-ghost);
  padding: 3px 8px;
  border-radius: 6px;
}
.ab-preview {
  flex: 1;
  min-width: 0;
  font-size: 13.5px;
  color: var(--ink-soft);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ab-actions {
  display: flex;
  gap: 4px;
}
.ab-add {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-top: 6px;
}
.ab-add select {
  max-width: 220px;
}
</style>
