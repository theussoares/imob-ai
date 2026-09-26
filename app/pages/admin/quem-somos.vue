<script setup lang="ts">
import { ABOUT_BLOCK_TYPE_LABELS, ABOUT_BLOCK_TYPES, emptyAboutBlock } from "~~/shared/models/about-page";
import type { AboutBlock, AboutBlockType } from "~~/shared/models/about-page";
import { ABOUT_BLOCKS_MAX, aboutTemConteudoMinimo, GALLERY_IMAGES_MAX, LOGOS_MAX } from "~~/shared/utils/about-content";
definePageMeta({ layout: "admin", middleware: ['admin', 'quem-somos'] });

// Tela própria (em vez de mais uma seção em "Meu site"): a edição aqui é por
// bloco — adicionar, reordenar, remover — um editor pequeno, não mais um grupo
// de campos. Cada tipo de bloco (shared/models/about-page.ts) é uma peça de
// Lego que a imobiliária encaixa na ordem que quiser.
const { tenant, form, saving, saved, error, save: persist } = useTenantSettings(["aboutContent", "aboutEnabled"]);
const toast = useToast();

const blocks = computed(() => form.aboutContent?.blocks ?? []);
const newBlockType = ref<AboutBlockType>("heading");

function addBlock() {
  if (blocks.value.length >= ABOUT_BLOCKS_MAX) return;
  form.aboutContent = {
    blocks: [...blocks.value, emptyAboutBlock(newBlockType.value)],
  };
}

// Remover não pergunta: devolve por alguns segundos. Um clique apagava um
// depoimento de 600 caracteres sem volta, e `confirm()` não resolveria — vira
// reflexo de "OK". O bloco reentra na posição de onde saiu (ou no fim, se a
// lista encolheu), e é o MESMO objeto: um upload que ainda estava subindo para
// ele continua caindo no lugar certo.
const avisosDeDesfazer: number[] = [];
function removeBlock(i: number) {
  const removido = blocks.value[i];
  if (!removido) return;
  form.aboutContent = { blocks: blocks.value.filter((_, n) => n !== i) };
  avisosDeDesfazer.push(
    toast.undoable(`Bloco "${ABOUT_BLOCK_TYPE_LABELS[removido.type]}" removido.`, () => {
      if (blocks.value.length >= ABOUT_BLOCKS_MAX) {
        toast.error(`A página já tem ${ABOUT_BLOCKS_MAX} blocos. Remova outro para trazer este de volta.`);
        return;
      }
      const arr = [...blocks.value];
      arr.splice(Math.min(i, arr.length), 0, removido);
      form.aboutContent = { blocks: arr };
    }),
  );
}
// O desfazer de uma tela que já fechou mexeria num formulário que não existe mais.
onBeforeUnmount(() => avisosDeDesfazer.forEach(toast.dismiss));

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
// por campo do editor (blocos e itens de galeria/logos são dinâmicos). Cada
// envio leva o PRÓPRIO destino (o setter) até o fim: antes havia um único
// "setter pendente", e enviar a foto do bloco B antes de a do A terminar
// gravava a foto de A em B e descartava a de B — numa galeria de 12 fotos,
// enviar em sequência é o uso normal.
//
// O "Enviando..." é marcado pelo OBJETO de destino (bloco ou item), não pelo
// índice: reordenar durante o envio mudaria o índice e o aviso pularia de bloco.
const enviando = reactive(new Set<object>());
const { onFile: onImageFile } = useBrandUpload({
  bucket: "tenant-hero",
  prefix: "about",
  maxEdge: IMAGE_SIZE_LG,
});
async function pickImage(alvo: object, setter: (url: string) => void, e: Event) {
  enviando.add(alvo);
  try {
    await onImageFile(e, setter);
  } finally {
    enviando.delete(alvo);
  }
}
function isUploading(alvo: object): boolean {
  return enviando.has(alvo);
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

// ---- Publicar ----
//
// O interruptor só LIGA com o mínimo (um texto, ou "texto + imagem" com texto):
// publicar vazio mostrava o parágrafo genérico de fallback, a página rala que o
// 404 de `quem-somos.vue` existe para evitar. Desligar sempre pode. Quem já
// está no ar sem o mínimo (publicou antes desta regra) é barrado no salvar, com
// a saída dita na mensagem — não dá para desmarcar por ela sem avisar.
const podePublicar = computed(() => aboutTemConteudoMinimo(form.aboutContent));
const MOTIVO_SEM_MINIMO = 'Para publicar, a página precisa de pelo menos um bloco "Texto" ou "Texto + imagem lado a lado" preenchido.';

// ---- Alterações não salvas ----
//
// Retrato do que está gravado, comparado com o formulário. Tirado depois do
// preenchimento (o watchEffect de useTenantSettings) e de novo a cada salvar —
// NÃO a cada mudança do tenant, que pode ser recarregado por fora e zeraria o
// aviso com o trabalho ainda na tela.
function retrato() {
  return JSON.stringify({ c: form.aboutContent, e: form.aboutEnabled });
}
const original = ref(retrato());
watch(
  () => !!tenant.value,
  async (carregado) => {
    if (!carregado) return;
    await nextTick();
    original.value = retrato();
  },
  { immediate: true },
);
const dirty = computed(() => retrato() !== original.value);
useUnsavedGuard(() => dirty.value);

async function save() {
  await persist(() => (form.aboutEnabled && !podePublicar.value ? `${MOTIVO_SEM_MINIMO} Ou desligue a publicação.` : null));
  if (saved.value) original.value = retrato();
}

// ---- Rótulos e nomes acessíveis ----
//
// Rótulo sem `for` não nomeia o campo: o leitor de tela anunciava "campo de
// edição" em todos, e clicar no rótulo não focava nada. Os blocos são
// dinâmicos, então o id é gerado — `useId()` para não colidir com outro
// formulário na mesma tela, índice e campo para ser único entre blocos.
const uid = useId();
function fid(i: number, campo: string) {
  return `${uid}-${i}-${campo}`;
}
/** "bloco 3, Depoimento: Maria" — o que as setas e o remover dizem ao leitor de tela. */
function descreve(b: AboutBlock, i: number) {
  return `bloco ${i + 1}, ${ABOUT_BLOCK_TYPE_LABELS[b.type]}: ${blockLabel(b)}`;
}

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
    <p class="ab-intro">
      Monte a página <code>/quem-somos</code> em blocos — banner, texto com imagem, galeria de
      fotos, depoimentos, carrossel de corretores e mais. Adicione, reordene e
      remova como quiser; o site mostra na mesma ordem daqui. O título com o nome
      da imobiliária, o CRECI e o contato no fim da página entram sozinhos, vindos
      de "Meu site" e "Configurações".
      <a href="/quem-somos" target="_blank" rel="noopener">Ver a página ↗</a>
    </p>

    <form class="admin-card" @submit.prevent="save">
<!--
        O interruptor fica AQUI e não em "Configurações": publicar é a última
        coisa que se faz depois de montar os blocos, e a decisão precisa estar
        na mesma tela do conteúdo que ela publica.
      -->
      <label class="ab-publicar" :class="{ travado: !form.aboutEnabled && !podePublicar }">
        <input
          v-model="form.aboutEnabled"
          type="checkbox"
          :disabled="!form.aboutEnabled && !podePublicar"
          :aria-describedby="`${uid}-publicar-dica`"
        >
        <span>
          <b>Publicar a página no site</b>
          <small :id="`${uid}-publicar-dica`">
            <template v-if="!podePublicar">{{ MOTIVO_SEM_MINIMO }}</template>
            <template v-else>
              Desligado, <code>/quem-somos</code> não existe para o visitante e o
              link some do rodapé.
            </template>
          </small>
        </span>
      </label>

      <div v-if="!blocks.length" class="ab-empty">
        Nenhum bloco ainda. Adicione o primeiro abaixo — comece por um "Texto"
        contando quem vocês são.
      </div>

      <div v-for="(b, i) in blocks" :key="i" class="ab-block">
        <div class="ab-block-head">
          <span class="ab-type">{{ ABOUT_BLOCK_TYPE_LABELS[b.type] }}</span>
          <span class="ab-preview">{{ blockLabel(b) }}</span>
          <div class="ab-actions">
            <button
              type="button"
              class="admin-btn ghost sm"
              :disabled="i === 0"
              :aria-label="`Mover ${descreve(b, i)} para cima`"
              @click="moveBlock(i, -1)"
            >
              <span aria-hidden="true">↑</span>
            </button>
            <button
              type="button"
              class="admin-btn ghost sm"
              :disabled="i === blocks.length - 1"
              :aria-label="`Mover ${descreve(b, i)} para baixo`"
              @click="moveBlock(i, 1)"
            >
              <span aria-hidden="true">↓</span>
            </button>
            <button
              type="button"
              class="admin-btn danger-ghost sm"
              :aria-label="`Remover ${descreve(b, i)}`"
              @click="removeBlock(i)"
            >
              Remover
            </button>
          </div>
        </div>

        <div v-if="b.type === 'heading'" class="ab-fields">
          <label class="admin-label" :for="fid(i, 'text')">Título</label>
          <input :id="fid(i, 'text')" v-model="b.text" class="admin-input" placeholder="Ex.: Nossa história" />
        </div>

        <div v-else-if="b.type === 'text'" class="ab-fields">
          <label class="admin-label" :for="fid(i, 'body')">Texto</label>
          <textarea
            :id="fid(i, 'body')"
            v-model="b.body"
            class="admin-textarea"
            rows="4"
            placeholder="Conte a história da imobiliária..."
          />
        </div>

        <div v-else-if="b.type === 'image'" class="ab-fields">
          <div class="logo-row">
            <div class="hero-img-preview">
              <img v-if="b.url" :src="supabaseRenderImage(b.url, { width: 120, height: 120, quality: 70 })" alt="" />
              <AppIcon v-else name="home" />
            </div>
            <label class="admin-btn ghost file-btn">
              {{ isUploading(b) ? "Enviando..." : b.url ? "Trocar imagem" : "Enviar imagem" }}
              <input type="file" accept="image/*" hidden @change="pickImage(b, (url) => (b.url = url), $event)" />
            </label>
            <button v-if="b.url" type="button" class="admin-btn ghost" @click="b.url = ''">Remover</button>
          </div>
          <div class="form-grid mt">
            <div>
              <label class="admin-label" :for="fid(i, 'alt')">Texto alternativo (acessibilidade)</label>
              <input :id="fid(i, 'alt')" v-model="b.alt" class="admin-input" placeholder="Ex.: Equipe da imobiliária" />
            </div>
            <div>
              <label class="admin-label" :for="fid(i, 'caption')">Legenda (opcional)</label>
              <input :id="fid(i, 'caption')" v-model="b.caption" class="admin-input" />
            </div>
          </div>
        </div>

        <div v-else-if="b.type === 'stat'" class="ab-fields form-grid">
          <div>
            <label class="admin-label" :for="fid(i, 'value')">Número</label>
            <input :id="fid(i, 'value')" v-model="b.value" class="admin-input" placeholder="Ex.: 20 anos" />
          </div>
          <div>
            <label class="admin-label" :for="fid(i, 'label')">Legenda</label>
            <input :id="fid(i, 'label')" v-model="b.label" class="admin-input" placeholder="Ex.: de mercado" />
          </div>
        </div>

        <div v-else-if="b.type === 'banner'" class="ab-fields">
          <label class="admin-label" :for="fid(i, 'title')">Título</label>
          <input
            :id="fid(i, 'title')"
            v-model="b.title"
            class="admin-input"
            placeholder="Ex.: 20 anos cuidando de quem confia na gente"
          />
          <div class="logo-row mt">
            <div class="hero-img-preview wide">
              <img v-if="b.imageUrl" :src="supabaseRenderImage(b.imageUrl, { width: 200, height: 120, quality: 70 })" alt="" />
              <AppIcon v-else name="home" />
            </div>
            <label class="admin-btn ghost file-btn">
              {{ isUploading(b) ? "Enviando..." : b.imageUrl ? "Trocar imagem de fundo" : "Enviar imagem de fundo" }}
              <input type="file" accept="image/*" hidden @change="pickImage(b, (url) => (b.imageUrl = url), $event)" />
            </label>
            <button v-if="b.imageUrl" type="button" class="admin-btn ghost" @click="b.imageUrl = ''">Remover</button>
          </div>
          <div class="form-grid mt">
            <div>
              <label class="admin-label" :for="fid(i, 'cta-label')">Botão — texto (opcional)</label>
              <input :id="fid(i, 'cta-label')" v-model="b.ctaLabel" class="admin-input" placeholder="Ex.: Fale com a gente" />
            </div>
            <div>
              <label class="admin-label" :for="fid(i, 'cta-href')">Botão — link (opcional)</label>
              <input :id="fid(i, 'cta-href')" v-model="b.ctaHref" class="admin-input" placeholder="/quero-vender ou https://..." />
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
              {{ isUploading(b) ? "Enviando..." : b.imageUrl ? "Trocar imagem" : "Enviar imagem" }}
              <input type="file" accept="image/*" hidden @change="pickImage(b, (url) => (b.imageUrl = url), $event)" />
            </label>
            <button v-if="b.imageUrl" type="button" class="admin-btn ghost" @click="b.imageUrl = ''">Remover</button>
          </div>
          <div class="form-grid mt">
            <div>
              <label class="admin-label" :for="fid(i, 'image-alt')">Texto alternativo da imagem</label>
              <input :id="fid(i, 'image-alt')" v-model="b.imageAlt" class="admin-input" />
            </div>
            <div>
              <span :id="fid(i, 'pos')" class="admin-label">Posição da imagem</span>
              <div class="pos-toggle" role="group" :aria-labelledby="fid(i, 'pos')">
                <button
                  type="button"
                  class="pos-btn"
                  :class="{ on: b.imagePosition === 'left' }"
                  :aria-pressed="b.imagePosition === 'left'"
                  @click="b.imagePosition = 'left'"
                >
                  Esquerda
                </button>
                <button
                  type="button"
                  class="pos-btn"
                  :class="{ on: b.imagePosition === 'right' }"
                  :aria-pressed="b.imagePosition === 'right'"
                  @click="b.imagePosition = 'right'"
                >
                  Direita
                </button>
              </div>
            </div>
          </div>
          <div class="mt">
            <label class="admin-label" :for="fid(i, 'title')">Título</label>
            <input :id="fid(i, 'title')" v-model="b.title" class="admin-input" />
          </div>
          <div class="mt">
            <label class="admin-label" :for="fid(i, 'body')">Texto</label>
            <textarea :id="fid(i, 'body')" v-model="b.body" class="admin-textarea" rows="4" />
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
              {{ isUploading(img) ? "Enviando..." : img.url ? "Trocar" : "Enviar" }}
              <input type="file" accept="image/*" hidden @change="pickImage(img, (url) => (img.url = url), $event)" />
            </label>
            <input
              v-model="img.alt"
              class="admin-input"
              placeholder="Texto alternativo"
              :aria-label="`Texto alternativo da foto ${j + 1}`"
            />
            <button
              type="button"
              class="admin-btn danger-ghost sm"
              :aria-label="`Remover foto ${j + 1}`"
              @click="removeGalleryImage(i, j)"
            >
              Remover
            </button>
          </div>
          <button
            type="button"
            class="admin-btn ghost sm ab-add-item"
            :disabled="b.images.length >= GALLERY_IMAGES_MAX"
            @click="addGalleryImage(i)"
          >
            + Adicionar foto
          </button>
        </div>

        <div v-else-if="b.type === 'testimonial'" class="ab-fields">
          <label class="admin-label" :for="fid(i, 'quote')">Depoimento</label>
          <textarea
            :id="fid(i, 'quote')"
            v-model="b.quote"
            class="admin-textarea"
            rows="3"
            placeholder="O que o cliente disse..."
          />
          <div class="form-grid mt">
            <div>
              <label class="admin-label" :for="fid(i, 'author')">Nome do cliente</label>
              <input :id="fid(i, 'author')" v-model="b.authorName" class="admin-input" />
            </div>
            <div>
              <label class="admin-label" :for="fid(i, 'role')">Complemento (opcional)</label>
              <input
                :id="fid(i, 'role')"
                v-model="b.authorRole"
                class="admin-input"
                placeholder="Ex.: comprou um apartamento em 2026"
              />
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
              {{ isUploading(item) ? "Enviando..." : item.url ? "Trocar" : "Enviar" }}
              <input type="file" accept="image/*" hidden @change="pickImage(item, (url) => (item.url = url), $event)" />
            </label>
            <input
              v-model="item.alt"
              class="admin-input"
              placeholder="Nome (texto alternativo)"
              :aria-label="`Nome do logo ${j + 1}`"
            />
            <button
              type="button"
              class="admin-btn danger-ghost sm"
              :aria-label="`Remover logo ${j + 1}`"
              @click="removeLogo(i, j)"
            >
              Remover
            </button>
          </div>
          <button
            type="button"
            class="admin-btn ghost sm ab-add-item"
            :disabled="b.items.length >= LOGOS_MAX"
            @click="addLogo(i)"
          >
            + Adicionar logo
          </button>
        </div>

        <div v-else-if="b.type === 'team'" class="ab-fields">
          <label class="admin-label" :for="fid(i, 'title')">Título da seção (opcional)</label>
          <input :id="fid(i, 'title')" v-model="b.title" class="admin-input" placeholder="Nossa equipe" />
          <p class="hint-text">
            Mostra, em carrossel, quem marcou "Mostrar este corretor no site" na tela
            <NuxtLink to="/admin/corretores">Corretores</NuxtLink>. Sem edição aqui — atualize foto e minibio lá.
          </p>
        </div>
      </div>

      <div class="ab-add">
        <label class="sr-only" :for="`${uid}-novo-tipo`">Tipo do novo bloco</label>
        <select :id="`${uid}-novo-tipo`" v-model="newBlockType" class="admin-input">
          <option v-for="t in ABOUT_BLOCK_TYPES" :key="t" :value="t">{{ ABOUT_BLOCK_TYPE_LABELS[t] }}</option>
        </select>
        <button type="button" class="admin-btn ghost" :disabled="blocks.length >= ABOUT_BLOCKS_MAX" @click="addBlock">
          + Adicionar bloco
        </button>
      </div>

      <p v-if="error" role="alert" class="ab-error">{{ error }}</p>

      <div class="ab-save">
        <button class="admin-btn" type="submit" :disabled="saving">
          {{ saving ? "Salvando..." : "Salvar" }}
        </button>
        <!-- "Salvo!" some ao voltar a editar: continuar dizendo "salvo" com
             alteração nova na tela é mentir sobre o estado. -->
        <span role="status" class="ab-state" :class="{ ok: saved && !dirty }">
          <template v-if="dirty">Alterações não salvas</template>
          <template v-else-if="saved">Salvo! <AppIcon name="check" /></template>
        </span>
      </div>
    </form>
  </div>
</template>

<style scoped>
.ab-intro {
  color: var(--ink-soft);
  margin-bottom: 18px;
}
.ab-publicar {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 12px 14px;
  margin-bottom: 16px;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--surface);
  cursor: pointer;
}
.ab-publicar.travado {
  cursor: not-allowed;
}
.ab-publicar.travado b {
  color: var(--ink-soft);
}
.ab-publicar input {
  margin-top: 3px;
  flex: none;
}
.ab-publicar b {
  display: block;
  font-size: var(--fs-ui);
}
.ab-publicar small {
  display: block;
  margin-top: 2px;
  font-size: var(--fs-caption);
  color: var(--ink-soft);
  line-height: 1.45;
}

.ab-empty {
  color: var(--ink-soft);
  font-size: var(--fs-ui);
  padding: 14px 0;
}
.ab-block {
  border: 1px solid var(--line);
  border-radius: var(--r-md);
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
  font-size: var(--fs-caption);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--brand);
  background: var(--brand-ghost);
  padding: 3px 8px;
  border-radius: var(--r-sm);
}
.ab-preview {
  flex: 1;
  min-width: 0;
  font-size: var(--fs-label);
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
.ab-add-item {
  align-self: flex-start;
  margin-top: 8px;
}
.mt {
  margin-top: 10px;
}
.ab-error {
  color: var(--danger);
  margin-top: 14px;
}
.ab-save {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  margin-top: 18px;
}
.ab-state {
  font-size: var(--fs-label);
  color: var(--ink-soft);
}
.ab-state.ok {
  color: var(--wa-dark);
  font-weight: 600;
}
.ab-fields {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.hint-text {
  font-size: var(--fs-caption);
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
  font-size: var(--fs-label);
}
.hero-img-preview {
  width: 60px;
  height: 60px;
  border-radius: var(--r-md);
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
  border-radius: var(--r-md);
}
.hero-img-preview.sm {
  width: 44px;
  height: 44px;
  border-radius: var(--r-sm);
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
  border-radius: var(--r-md);
  background: var(--paper);
  font-size: var(--fs-label);
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
