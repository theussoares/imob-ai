<script setup lang="ts">
import { ABOUT_BLOCK_TYPE_LABELS, ABOUT_BLOCK_TYPES, emptyAboutBlock } from "~~/shared/models/about-page";
import type { AboutBlock, AboutBlockType } from "~~/shared/models/about-page";
import { ABOUT_BLOCKS_MAX, GALLERY_IMAGES_MAX, LOGOS_MAX } from "~~/shared/utils/about-content";
definePageMeta({ layout: "admin", middleware: "admin" });

// Tela própria (em vez de mais uma seção em "Meu site"): a edição aqui é por
// bloco — adicionar, reordenar, remover — um editor pequeno, não mais um grupo
// de campos. Cada tipo de bloco (shared/models/about-page.ts) é uma peça de
// Lego que a imobiliária encaixa na ordem que quiser.
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

// ---- Upload de imagem, compartilhado por todo bloco que tem foto ----
//
// useBrandUpload é um composable — precisa ser chamado uma vez no setup, não
// por campo do editor (blocos e itens de galeria/logos são dinâmicos). Em vez
// de um `uploadingAt` por tipo de bloco, guarda uma CHAVE de texto (índice do
// bloco, ou "índice do bloco:índice do item" para galeria/logos) e um setter —
// assim um único upload em andamento serve imagem única, split, banner,
// galeria e logos sem duplicar a integração com o Storage.
const uploadingKey = ref<string | null>(null);
let pendingSetter: ((url: string) => void) | null = null;
const { uploading: uploadingImage, onFile: onImageFile } = useBrandUpload({
  bucket: "tenant-hero",
  prefix: "about",
  maxEdge: IMAGE_SIZE_LG,
  onDone: (url) => {
    pendingSetter?.(url);
    uploadingKey.value = null;
    pendingSetter = null;
  },
});
function pickImage(key: string, setter: (url: string) => void, e: Event) {
  uploadingKey.value = key;
  pendingSetter = setter;
  onImageFile(e);
}
function isUploading(key: string): boolean {
  return uploadingImage.value && uploadingKey.value === key;
}

// ---- Itens de galeria/logos (arrays dentro de um bloco só) ----
function addGalleryImage(i: number) {
  const b = blocks.value[i];
  if (b?.type !== "gallery" || b.images.length >= GALLERY_IMAGES_MAX) return;
  b.images = [...b.images, { url: "", alt: "" }];
}
function removeGalleryImage(i: number, j: number) {
  const b = blocks.value[i];
  if (b?.type !== "gallery") return;
  b.images = b.images.filter((_, n) => n !== j);
}
function addLogo(i: number) {
  const b = blocks.value[i];
  if (b?.type !== "logos" || b.items.length >= LOGOS_MAX) return;
  b.items = [...b.items, { url: "", alt: "" }];
}
function removeLogo(i: number, j: number) {
  const b = blocks.value[i];
  if (b?.type !== "logos") return;
  b.items = b.items.filter((_, n) => n !== j);
}

// Wrapper sem argumento: `persist` aceita um `validate` opcional, mas o tipo
// dele não bate com o SubmitEvent que o @submit passaria direto.
const save = () => persist();

function blockLabel(b: AboutBlock): string {
  switch (b.type) {
    case "heading":
      return b.text || "(sem título)";
    case "text":
      return b.body ? b.body.slice(0, 40) + (b.body.length > 40 ? "…" : "") : "(sem texto)";
    case "image":
      return b.caption || b.alt || "(sem legenda)";
    case "stat":
      return b.label || "(sem rótulo)";
    case "banner":
      return b.title || "(sem título)";
    case "split":
      return b.title || "(sem título)";
    case "gallery":
      return `${b.images.length} foto${b.images.length === 1 ? "" : "s"}`;
    case "testimonial":
      return b.authorName || "(sem autor)";
    case "logos":
      return `${b.items.length} logo${b.items.length === 1 ? "" : "s"}`;
    case "team":
      return b.title || "Nossa equipe";
  }
}

useHead({ title: "Quem somos · Painel" });
</script>

<template>
  <div>
    <h1>Quem somos</h1>
    <p style="color: var(--ink-soft); margin-bottom: 18px">
      Monte a página <code>/quem-somos</code> em blocos — banner, texto com imagem, galeria de
      fotos, depoimentos, carrossel de corretores e mais. Adicione, reordene e
      remova como quiser; o site mostra na mesma ordem daqui.
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
              {{ isUploading(`${i}`) ? "Enviando..." : b.url ? "Trocar imagem" : "Enviar imagem" }}
              <input type="file" accept="image/*" hidden @change="pickImage(`${i}`, (url) => (b.url = url), $event)" />
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

        <div v-else-if="b.type === 'banner'" class="ab-fields">
          <label class="admin-label">Título</label>
          <input v-model="b.title" class="admin-input" placeholder="Ex.: 20 anos cuidando de quem confia na gente" />
          <div class="logo-row" style="margin-top: 10px">
            <div class="hero-img-preview wide">
              <img v-if="b.imageUrl" :src="supabaseRenderImage(b.imageUrl, { width: 200, height: 120, quality: 70 })" alt="" />
              <AppIcon v-else name="home" />
            </div>
            <label class="admin-btn ghost file-btn">
              {{ isUploading(`${i}`) ? "Enviando..." : b.imageUrl ? "Trocar imagem de fundo" : "Enviar imagem de fundo" }}
              <input type="file" accept="image/*" hidden @change="pickImage(`${i}`, (url) => (b.imageUrl = url), $event)" />
            </label>
            <button v-if="b.imageUrl" type="button" class="admin-btn ghost" @click="b.imageUrl = ''">Remover</button>
          </div>
          <div class="form-grid" style="margin-top: 10px">
            <div>
              <label class="admin-label">Botão — texto (opcional)</label>
              <input v-model="b.ctaLabel" class="admin-input" placeholder="Ex.: Fale com a gente" />
            </div>
            <div>
              <label class="admin-label">Botão — link (opcional)</label>
              <input v-model="b.ctaHref" class="admin-input" placeholder="/quero-vender ou https://..." />
            </div>
          </div>
          <p class="hint-text">O botão só aparece se texto e link estiverem preenchidos.</p>
        </div>

        <div v-else-if="b.type === 'split'" class="ab-fields">
          <div class="logo-row">
            <div class="hero-img-preview">
              <img v-if="b.imageUrl" :src="supabaseRenderImage(b.imageUrl, { width: 120, height: 120, quality: 70 })" alt="" />
              <AppIcon v-else name="home" />
            </div>
            <label class="admin-btn ghost file-btn">
              {{ isUploading(`${i}`) ? "Enviando..." : b.imageUrl ? "Trocar imagem" : "Enviar imagem" }}
              <input type="file" accept="image/*" hidden @change="pickImage(`${i}`, (url) => (b.imageUrl = url), $event)" />
            </label>
            <button v-if="b.imageUrl" type="button" class="admin-btn ghost" @click="b.imageUrl = ''">Remover</button>
          </div>
          <div class="form-grid" style="margin-top: 10px">
            <div>
              <label class="admin-label">Texto alternativo da imagem</label>
              <input v-model="b.imageAlt" class="admin-input" />
            </div>
            <div>
              <label class="admin-label">Posição da imagem</label>
              <div class="pos-toggle">
                <button type="button" class="pos-btn" :class="{ on: b.imagePosition === 'left' }" @click="b.imagePosition = 'left'">
                  Esquerda
                </button>
                <button type="button" class="pos-btn" :class="{ on: b.imagePosition === 'right' }" @click="b.imagePosition = 'right'">
                  Direita
                </button>
              </div>
            </div>
          </div>
          <div style="margin-top: 10px">
            <label class="admin-label">Título</label>
            <input v-model="b.title" class="admin-input" />
          </div>
          <div style="margin-top: 10px">
            <label class="admin-label">Texto</label>
            <textarea v-model="b.body" class="admin-textarea" rows="4" />
          </div>
        </div>

        <div v-else-if="b.type === 'gallery'" class="ab-fields">
          <p class="hint-text">Fotos do escritório, eventos, bastidores. Sem legenda visível — só texto alternativo.</p>
          <div v-for="(img, j) in b.images" :key="j" class="ab-gallery-item">
            <div class="hero-img-preview sm">
              <img v-if="img.url" :src="supabaseRenderImage(img.url, { width: 90, height: 90, quality: 70 })" alt="" />
              <AppIcon v-else name="home" />
            </div>
            <label class="admin-btn ghost file-btn sm">
              {{ isUploading(`${i}:${j}`) ? "Enviando..." : img.url ? "Trocar" : "Enviar" }}
              <input type="file" accept="image/*" hidden @change="pickImage(`${i}:${j}`, (url) => (img.url = url), $event)" />
            </label>
            <input v-model="img.alt" class="admin-input" placeholder="Texto alternativo" />
            <button type="button" class="admin-btn danger sm" @click="removeGalleryImage(i, j)">Remover</button>
          </div>
          <button type="button" class="admin-btn ghost sm" :disabled="b.images.length >= GALLERY_IMAGES_MAX" style="margin-top: 8px" @click="addGalleryImage(i)">
            + Adicionar foto
          </button>
        </div>

        <div v-else-if="b.type === 'testimonial'" class="ab-fields">
          <label class="admin-label">Depoimento</label>
          <textarea v-model="b.quote" class="admin-textarea" rows="3" placeholder="O que o cliente disse..." />
          <div class="form-grid" style="margin-top: 10px">
            <div>
              <label class="admin-label">Nome do cliente</label>
              <input v-model="b.authorName" class="admin-input" />
            </div>
            <div>
              <label class="admin-label">Complemento (opcional)</label>
              <input v-model="b.authorRole" class="admin-input" placeholder="Ex.: comprou um apartamento em 2026" />
            </div>
          </div>
        </div>

        <div v-else-if="b.type === 'logos'" class="ab-fields">
          <p class="hint-text">Selos, certificações, portais parceiros (ZAP, VivaReal...).</p>
          <div v-for="(item, j) in b.items" :key="j" class="ab-gallery-item">
            <div class="hero-img-preview sm">
              <img v-if="item.url" :src="supabaseRenderImage(item.url, { width: 90, height: 90, quality: 70 })" alt="" />
              <AppIcon v-else name="home" />
            </div>
            <label class="admin-btn ghost file-btn sm">
              {{ isUploading(`${i}:${j}`) ? "Enviando..." : item.url ? "Trocar" : "Enviar" }}
              <input type="file" accept="image/*" hidden @change="pickImage(`${i}:${j}`, (url) => (item.url = url), $event)" />
            </label>
            <input v-model="item.alt" class="admin-input" placeholder="Nome (texto alternativo)" />
            <button type="button" class="admin-btn danger sm" @click="removeLogo(i, j)">Remover</button>
          </div>
          <button type="button" class="admin-btn ghost sm" :disabled="b.items.length >= LOGOS_MAX" style="margin-top: 8px" @click="addLogo(i)">
            + Adicionar logo
          </button>
        </div>

        <div v-else-if="b.type === 'team'" class="ab-fields">
          <label class="admin-label">Título da seção (opcional)</label>
          <input v-model="b.title" class="admin-input" placeholder="Nossa equipe" />
          <p class="hint-text">
            Mostra, em carrossel, quem marcou "Mostrar este corretor no site" na tela
            <NuxtLink to="/admin/corretores">Corretores</NuxtLink>. Sem edição aqui — atualize foto e minibio lá.
          </p>
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
.ab-fields {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.hint-text {
  font-size: 12.5px;
  color: var(--ink-soft);
  margin: 6px 0 0;
}
.logo-row {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}
.file-btn {
  cursor: pointer;
}
.file-btn.sm {
  padding: 8px 12px;
  font-size: 13px;
}
.hero-img-preview {
  width: 60px;
  height: 60px;
  border-radius: 12px;
  background: var(--surface);
  border: 1.5px solid var(--line-2);
  color: var(--ink-soft);
  display: grid;
  place-items: center;
  overflow: hidden;
  flex: none;
}
.hero-img-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.hero-img-preview :deep(svg) {
  width: 26px;
  height: 26px;
}
.hero-img-preview.wide {
  width: 100px;
  height: 60px;
  border-radius: 10px;
}
.hero-img-preview.sm {
  width: 44px;
  height: 44px;
  border-radius: 8px;
}
.form-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 14px;
}
@media (min-width: 520px) {
  .form-grid {
    grid-template-columns: 1fr 1fr;
  }
}
.pos-toggle {
  display: flex;
  gap: 8px;
}
.pos-btn {
  flex: 1;
  padding: 10px;
  border: 1.5px solid var(--line-2);
  border-radius: 10px;
  background: var(--paper);
  font-size: 13px;
  font-weight: 600;
  color: var(--ink-soft);
  cursor: pointer;
}
.pos-btn.on {
  border-color: var(--brand);
  color: var(--ink);
  background: var(--brand-ghost);
}
.ab-gallery-item {
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  margin-top: 8px;
}
@media (max-width: 640px) {
  .ab-gallery-item {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
