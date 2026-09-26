<script setup lang="ts">
import { ABOUT_BLOCK_TYPE_LABELS, emptyAboutBlock, recommendedAboutBlocks } from "~~/shared/models/about-page";
import type { AboutBlock, AboutBlockType } from "~~/shared/models/about-page";
import type { Broker } from "~~/shared/models/broker";
import { aboutChecklist } from "~~/shared/utils/about-checklist";
import type { PublicBroker } from "~~/shared/models/broker";
import {
  ABOUT_BLOCKS_MAX,
  aboutTemConteudoMinimo,
  GALLERY_IMAGES_MAX,
  LOGOS_MAX,
  sanitizeAboutContent,
  STATS_MAX,
  TESTIMONIALS_MAX,
  VALUES_MAX,
} from "~~/shared/utils/about-content";
definePageMeta({ layout: "admin", middleware: ['admin', 'quem-somos'] });

// Tela própria (em vez de mais uma seção em "Meu site"): a edição aqui é por
// bloco — adicionar, reordenar, remover — um editor pequeno, não mais um grupo
// de campos. Cada tipo de bloco (shared/models/about-page.ts) é uma peça de
// Lego que a imobiliária encaixa na ordem que quiser.
const { tenant, form, saving, saved, error, save: persist } = useTenantSettings(["aboutContent", "aboutEnabled"]);
const toast = useToast();

const blocks = computed(() => form.aboutContent?.blocks ?? []);
const cheio = computed(() => blocks.value.length >= ABOUT_BLOCKS_MAX);

// ---- Identidade de bloco ----
//
// Tudo que é "deste bloco" — chave do v-for, qual está aberto, a dica do modelo
// — é preso ao OBJETO, não ao índice. Com "+" entre blocos, inserir no meio
// desloca todos os índices seguintes: preso ao índice, o bloco aberto pularia
// para o vizinho e o campo em foco trocaria de conteúdo sob o cursor.
//
// `toRaw` dos dois lados: o bloco entra na lista cru e volta dela como proxy
// reativo, e para um WeakMap os dois são chaves diferentes.
const chaves = new WeakMap<object, number>();
let proximaChave = 0;
function chave(b: AboutBlock): number {
  const raw = toRaw(b);
  let k = chaves.get(raw);
  if (k === undefined) chaves.set(raw, (k = ++proximaChave));
  return k;
}

/**
 * Um bloco aberto por vez. Todos abertos era uma parede de campos — dez blocos
 * viravam três telas de inputs sem hierarquia; fechados, cada um mostra tipo e
 * resumo, e a página se lê como um sumário.
 */
const aberto = shallowRef<object | null>(null);
const estaAberto = (b: AboutBlock) => aberto.value === toRaw(b);
function alternar(b: AboutBlock) {
  aberto.value = estaAberto(b) ? null : toRaw(b);
}

/** Dica do modelo recomendado: vive só no painel, nunca é salva. */
const dicas = new WeakMap<object, string>();
const dicaDe = (b: AboutBlock) => dicas.get(toRaw(b));

/** Onde a paleta está aberta: índice de inserção (0 = antes do primeiro). */
const paletaEm = ref<number | null>(null);

function inserir(novos: AboutBlock[], em: number) {
  const vagas = ABOUT_BLOCKS_MAX - blocks.value.length;
  if (vagas <= 0) return;
  const arr = [...blocks.value];
  arr.splice(em, 0, ...novos.slice(0, vagas));
  form.aboutContent = { blocks: arr };
  paletaEm.value = null;
  // Abre o primeiro inserido e leva o foco a ele: sem isso, quem usa teclado
  // ou leitor de tela fica no botão "+", que some com a paleta, e perde o lugar.
  const primeiro = toRaw(novos[0]!);
  aberto.value = primeiro;
  nextTick(() => document.getElementById(`${uid}-bloco-${chaves.get(primeiro)}`)?.focus());
}
function adicionar(type: AboutBlockType, em: number) {
  inserir([emptyAboutBlock(type)], em);
}

/**
 * "Montar a estrutura recomendada" com a página vazia. Seguro por construção:
 * os blocos vêm vazios, e o sanitizador descarta bloco vazio ao salvar — nada
 * do modelo aparece no site sem a pessoa escrever. Ver `recommendedAboutBlocks`.
 */
function usarModelo() {
  const modelo = recommendedAboutBlocks();
  for (const { block, hint } of modelo) dicas.set(block, hint);
  inserir(
    modelo.map((m) => m.block),
    0,
  );
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
/**
 * Itens de logos, números, depoimentos e compromissos: todos guardam a lista em
 * `items`, então um par de funções serve os quatro. O teto vem de quem chama —
 * é o mesmo que o sanitizador aplica, para o botão travar onde o site cortaria.
 */
function adicionarItem<T>(b: { items: T[] }, novo: T, max: number) {
  if (b.items.length < max) b.items = [...b.items, novo];
}
function removerItem(b: { items: unknown[] }, j: number) {
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

const salvoAs = ref("");
async function save() {
  await persist(() => (form.aboutEnabled && !podePublicar.value ? `${MOTIVO_SEM_MINIMO} Ou desligue a publicação.` : null));
  if (!saved.value) return;
  original.value = retrato();
  salvoAs.value = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

// ---- Checklist e equipe ----
//
// O bloco "equipe" some do site quando nenhum corretor está marcado como
// público — e nada no painel dizia isso. Contamos aqui, com o mesmo critério da
// leitura pública (`listPublicBrokers`: ativo E público). Lazy: a tela abre na
// hora; enquanto carrega, `null` e o checklist não acusa nada.
const { data: corretores } = useLazyAsyncData(
  "admin:quem-somos:brokers",
  () => adminFetch<Broker[]>("/api/admin/brokers"),
  { server: false, default: () => null },
);
const corretoresPublicos = computed(() =>
  corretores.value ? corretores.value.filter((c) => c.active && c.publicVisible).length : null,
);
const checklist = computed(() => aboutChecklist(form.aboutContent, corretoresPublicos.value));

// ---- Pré-visualização ----
//
// O MESMO componente do site (AboutBlocks), alimentado pelo rascunho passado
// pelo sanitizador — ou seja, exatamente o que salvar publicaria: bloco vazio
// não aparece, número sem legenda some. Antes, conferir exigia salvar e abrir o
// site em outra aba, e quem estava com a página no ar publicava para testar.
const previa = computed(() => sanitizeAboutContent(form.aboutContent).blocks);
const corretoresNaPrevia = computed<PublicBroker[]>(() =>
  (corretores.value ?? [])
    .filter((c) => c.active && c.publicVisible)
    .map((c) => ({ id: c.id, name: c.name, photoUrl: c.photoUrl, bio: c.bio, creci: c.creci })),
);
// Lado a lado só em tela larga; abaixo disso a prévia fica sob o formulário,
// recolhida, para não dobrar o comprimento da tela no celular.
const telaLarga = useMediaQuery("(min-width: 1280px)");
const previaAberta = ref(false);
/** Link na prévia não navega: sairia do painel no meio da edição. */
function semNavegar(e: MouseEvent) {
  if ((e.target as HTMLElement | null)?.closest("a")) e.preventDefault();
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
    case "stats":
      return b.items.map((it) => it.value).filter(Boolean).join(" · ") || "(sem números)";
    case "values":
      return `${b.title || "Como trabalhamos"} · ${b.items.length} ${b.items.length === 1 ? "item" : "itens"}`;
    case "testimonials": {
      const nomes = b.items.map((it) => it.authorName).filter(Boolean);
      return nomes.length ? nomes.join(", ") : `${b.items.length} depoimento${b.items.length === 1 ? "" : "s"}`;
    }
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

    <div class="ab-layout">
    <form class="admin-card" @submit.prevent="save">
<!--
        O interruptor fica AQUI e não em "Configurações": publicar é a última
        coisa que se faz depois de montar os blocos, e a decisão precisa estar
        na mesma tela do conteúdo que ela publica.
      -->
      <div class="ab-publish">
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

      <!-- Orienta, não bloqueia: ver `aboutChecklist`. -->
      <div class="ab-checklist">
        <span :id="`${uid}-checklist`" class="ab-checklist-t">O que costuma fazer uma boa página</span>
        <ul :aria-labelledby="`${uid}-checklist`">
          <li v-for="item in checklist" :key="item.key" :class="{ ok: item.ok }">
            <span class="ab-check" aria-hidden="true">{{ item.ok ? "✓" : "○" }}</span>
            <span class="sr-only">{{ item.ok ? "Feito:" : "Pendente:" }}</span>
            {{ item.label }}
            <NuxtLink v-if="item.key === 'equipe' && corretoresPublicos === 0" to="/admin/corretores">Abrir Corretores</NuxtLink>
          </li>
        </ul>
      </div>
      </div>

      <div v-if="!blocks.length" class="ab-empty">
        <p>
          Nenhum bloco ainda. O jeito mais rápido é partir da estrutura que costuma
          funcionar — números, história, como vocês trabalham, equipe, depoimentos
          e selos. Os blocos entram vazios, com a dica do que escrever em cada um;
          o que ficar vazio não aparece no site.
        </p>
        <div class="ab-empty-actions">
          <button type="button" class="admin-btn" @click="usarModelo">Montar a estrutura recomendada</button>
          <button type="button" class="admin-btn ghost" @click="paletaEm = 0">Escolher um bloco</button>
        </div>
      </div>

      <template v-for="(b, i) in blocks" :key="chave(b)">
      <!--
        "+" entre blocos: antes, bloco novo só entrava no fim, e colocar um
        depoimento no meio custava N cliques de seta.
      -->
      <AdminAboutBlockPalette
        v-if="paletaEm === i"
        :titulo="`Inserir bloco antes do bloco ${i + 1}`"
        class="ab-pal"
        @pick="(t) => adicionar(t, i)"
        @cancel="paletaEm = null"
      />
      <div v-else-if="i > 0 && !cheio" class="ab-gap">
        <button type="button" class="ab-gap-btn" @click="paletaEm = i">
          <span aria-hidden="true">+</span> Inserir bloco aqui
          <span class="sr-only">, entre o bloco {{ i }} e o {{ i + 1 }}</span>
        </button>
      </div>

      <div class="ab-block" :class="{ open: estaAberto(b) }">
        <div class="ab-block-head">
          <button
            :id="`${uid}-bloco-${chave(b)}`"
            type="button"
            class="ab-toggle"
            :aria-expanded="estaAberto(b)"
            :aria-controls="`${uid}-corpo-${chave(b)}`"
            @click="alternar(b)"
          >
            <span class="ab-chevron" aria-hidden="true">›</span>
            <span class="ab-type">{{ ABOUT_BLOCK_TYPE_LABELS[b.type] }}</span>
            <span class="ab-preview">{{ blockLabel(b) }}</span>
            <span v-if="isUploading(b)" class="ab-busy">Enviando...</span>
          </button>
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

        <div v-if="estaAberto(b)" :id="`${uid}-corpo-${chave(b)}`" class="ab-body">
        <p v-if="dicaDe(b)" class="ab-dica">{{ dicaDe(b) }}</p>

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

        <div v-else-if="b.type === 'stats'" class="ab-fields">
          <p class="hint-text">Até {{ STATS_MAX }} números. Número sem legenda não aparece no site.</p>
          <div v-for="(it, j) in b.items" :key="j" class="ab-item">
            <div class="form-grid">
              <div>
                <label class="admin-label" :for="fid(i, `stat-${j}-v`)">Número {{ j + 1 }}</label>
                <input :id="fid(i, `stat-${j}-v`)" v-model="it.value" class="admin-input" placeholder="Ex.: 18 anos" />
              </div>
              <div>
                <label class="admin-label" :for="fid(i, `stat-${j}-l`)">Legenda</label>
                <input :id="fid(i, `stat-${j}-l`)" v-model="it.label" class="admin-input" placeholder="Ex.: de mercado" />
              </div>
            </div>
            <button type="button" class="admin-btn danger-ghost sm" :aria-label="`Remover número ${j + 1}`" @click="removerItem(b, j)">
              Remover
            </button>
          </div>
          <button
            type="button"
            class="admin-btn ghost sm ab-add-item"
            :disabled="b.items.length >= STATS_MAX"
            @click="adicionarItem(b, { value: '', label: '' }, STATS_MAX)"
          >
            + Adicionar número
          </button>
        </div>

        <div v-else-if="b.type === 'values'" class="ab-fields">
          <label class="admin-label" :for="fid(i, 'values-title')">Título da seção (opcional)</label>
          <input :id="fid(i, 'values-title')" v-model="b.title" class="admin-input" placeholder="Como trabalhamos" />
          <p class="hint-text">
            Até {{ VALUES_MAX }} compromissos que o cliente consegue conferir. Título curto, uma frase de explicação.
          </p>
          <div v-for="(it, j) in b.items" :key="j" class="ab-item">
            <div>
              <label class="admin-label" :for="fid(i, `value-${j}-t`)">Compromisso {{ j + 1 }}</label>
              <input :id="fid(i, `value-${j}-t`)" v-model="it.title" class="admin-input" placeholder="Ex.: Visita no mesmo dia" />
              <label class="admin-label mt" :for="fid(i, `value-${j}-b`)">Explicação (opcional)</label>
              <textarea
                :id="fid(i, `value-${j}-b`)"
                v-model="it.body"
                class="admin-textarea"
                rows="2"
                placeholder="Ex.: Pediu até as 14h, visita o imóvel no mesmo dia."
              />
            </div>
            <button type="button" class="admin-btn danger-ghost sm" :aria-label="`Remover compromisso ${j + 1}`" @click="removerItem(b, j)">
              Remover
            </button>
          </div>
          <button
            type="button"
            class="admin-btn ghost sm ab-add-item"
            :disabled="b.items.length >= VALUES_MAX"
            @click="adicionarItem(b, { title: '', body: '' }, VALUES_MAX)"
          >
            + Adicionar compromisso
          </button>
        </div>

        <div v-else-if="b.type === 'testimonials'" class="ab-fields">
          <p class="hint-text">
            Até {{ TESTIMONIALS_MAX }} depoimentos. No complemento, diga o que o cliente fez, onde e quando — é o que
            faz o depoimento parecer de gente real.
          </p>
          <div v-for="(it, j) in b.items" :key="j" class="ab-item">
            <div>
              <label class="admin-label" :for="fid(i, `dep-${j}-q`)">Depoimento {{ j + 1 }}</label>
              <textarea
                :id="fid(i, `dep-${j}-q`)"
                v-model="it.quote"
                class="admin-textarea"
                rows="3"
                placeholder="O que o cliente disse..."
              />
              <div class="form-grid mt">
                <div>
                  <label class="admin-label" :for="fid(i, `dep-${j}-n`)">Nome do cliente</label>
                  <input :id="fid(i, `dep-${j}-n`)" v-model="it.authorName" class="admin-input" />
                </div>
                <div>
                  <label class="admin-label" :for="fid(i, `dep-${j}-r`)">Complemento</label>
                  <input
                    :id="fid(i, `dep-${j}-r`)"
                    v-model="it.authorRole"
                    class="admin-input"
                    placeholder="Ex.: comprou um apartamento no Centro em 2025"
                  />
                </div>
              </div>
            </div>
            <button type="button" class="admin-btn danger-ghost sm" :aria-label="`Remover depoimento ${j + 1}`" @click="removerItem(b, j)">
              Remover
            </button>
          </div>
          <button
            type="button"
            class="admin-btn ghost sm ab-add-item"
            :disabled="b.items.length >= TESTIMONIALS_MAX"
            @click="adicionarItem(b, { quote: '', authorName: '', authorRole: '' }, TESTIMONIALS_MAX)"
          >
            + Adicionar depoimento
          </button>
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
              @click="removerItem(b, j)"
            >
              Remover
            </button>
          </div>
          <button
            type="button"
            class="admin-btn ghost sm ab-add-item"
            :disabled="b.items.length >= LOGOS_MAX"
            @click="adicionarItem(b, { url: '', alt: '' }, LOGOS_MAX)"
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
          <p v-if="corretoresPublicos === 0" class="ab-alerta" role="note">
            Nenhum corretor aparece no site ainda, então este bloco não será mostrado.
            Marque "Mostrar este corretor no site" em
            <NuxtLink to="/admin/corretores">Corretores</NuxtLink>.
          </p>
        </div>
        </div>
      </div>
      </template>

      <AdminAboutBlockPalette
        v-if="paletaEm !== null && paletaEm >= blocks.length"
        :titulo="blocks.length ? 'Adicionar bloco no fim' : 'Escolha o primeiro bloco'"
        class="ab-pal"
        @pick="(t) => adicionar(t, blocks.length)"
        @cancel="paletaEm = null"
      />
      <div v-else-if="blocks.length" class="ab-add">
        <button type="button" class="admin-btn ghost" :disabled="cheio" @click="paletaEm = blocks.length">
          + Adicionar bloco no fim
        </button>
        <span v-if="cheio" class="hint-text">Limite de {{ ABOUT_BLOCKS_MAX }} blocos.</span>
      </div>

      <p v-if="error" role="alert" class="ab-error">{{ error }}</p>

      <!--
        Barra fixa no pé: o botão ficava no fim de um formulário de dez blocos,
        e "Salvo!" aparecia onde ninguém estava olhando.
      -->
      <div class="ab-save">
        <button class="admin-btn" type="submit" :disabled="saving">
          {{ saving ? "Salvando..." : "Salvar" }}
        </button>
        <!-- "Salvo!" some ao voltar a editar: continuar dizendo "salvo" com
             alteração nova na tela é mentir sobre o estado. -->
        <span role="status" class="ab-state" :class="{ ok: saved && !dirty }">
          <template v-if="dirty">Alterações não salvas</template>
          <template v-else-if="saved">Salvo às {{ salvoAs }} <AppIcon name="check" /></template>
        </span>
      </div>
    </form>

    <aside class="ab-previa" aria-labelledby="ab-previa-t">
      <div class="ab-previa-head">
        <h2 id="ab-previa-t">Pré-visualização</h2>
        <button
          v-if="!telaLarga"
          type="button"
          class="admin-btn ghost sm"
          :aria-expanded="previaAberta"
          aria-controls="ab-previa-corpo"
          @click="previaAberta = !previaAberta"
        >
          {{ previaAberta ? "Esconder" : "Mostrar" }}
        </button>
      </div>
      <div v-if="telaLarga || previaAberta" id="ab-previa-corpo">
        <p class="hint-text">
          Como o site mostra os blocos, antes de salvar. Bloco vazio não aparece. O título com o
          nome, o CRECI e o contato do fim entram sozinhos na página.
        </p>
        <div class="ab-previa-pagina" @click.capture="semNavegar">
          <AboutBlocks v-if="previa.length" :blocks="previa" :brokers="corretoresNaPrevia" />
          <p v-else class="hint-text">Nada para mostrar ainda.</p>
        </div>
      </div>
    </aside>
    </div>
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

.ab-publish {
  display: grid;
  gap: 12px;
  margin-bottom: 16px;
}
@media (min-width: 900px) {
  .ab-publish {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    align-items: start;
  }
}
.ab-publish .ab-publicar {
  margin-bottom: 0;
}
.ab-checklist {
  font-size: var(--fs-label);
}
.ab-checklist-t {
  display: block;
  font-weight: 700;
  margin-bottom: 6px;
}
.ab-checklist ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 4px;
}
.ab-checklist li {
  color: var(--ink-soft);
}
.ab-checklist li.ok {
  color: var(--ink);
}
.ab-check {
  display: inline-block;
  width: 1.2em;
  font-weight: 700;
}
.ab-checklist li.ok .ab-check {
  color: var(--ok);
}

.ab-empty {
  padding: 18px;
  margin-bottom: 14px;
  border: 1.5px dashed var(--line-2);
  border-radius: var(--r-md);
  color: var(--ink-soft);
  font-size: var(--fs-ui);
}
.ab-empty p {
  margin: 0 0 12px;
  max-width: 70ch;
}
.ab-empty-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.ab-pal {
  margin-bottom: 10px;
}
.ab-gap {
  display: flex;
  justify-content: center;
  margin: -6px 0 4px;
}
.ab-gap-btn {
  border: none;
  background: none;
  padding: 4px 10px;
  border-radius: var(--r-sm);
  font: inherit;
  font-size: var(--fs-caption);
  font-weight: 600;
  color: var(--ink-soft);
  cursor: pointer;
}
.ab-gap-btn:hover,
.ab-gap-btn:focus-visible {
  color: var(--brand);
  background: var(--brand-ghost);
}
.ab-block {
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  padding: 8px 10px;
  margin-bottom: 10px;
}
.ab-block.open {
  border-color: var(--line-2);
  padding-bottom: 14px;
}
.ab-block-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ab-toggle {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 4px;
  border: none;
  background: none;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.ab-chevron {
  flex: none;
  font-size: 18px;
  line-height: 1;
  color: var(--ink-soft);
  transition: transform 0.15s;
}
.ab-block.open .ab-chevron {
  transform: rotate(90deg);
}
@media (prefers-reduced-motion: reduce) {
  .ab-chevron {
    transition: none;
  }
}
.ab-busy {
  flex: none;
  font-size: var(--fs-caption);
  color: var(--brand);
  font-weight: 600;
}
.ab-body {
  margin-top: 10px;
  padding-top: 12px;
  border-top: 1px solid var(--line);
}
.ab-dica {
  margin: 0 0 12px;
  padding: 10px 12px;
  border-radius: var(--r-sm);
  background: var(--brand-ghost);
  font-size: var(--fs-label);
  line-height: 1.45;
}
.ab-alerta {
  margin: 8px 0 0;
  padding: 10px 12px;
  border-radius: var(--r-sm);
  border: 1px solid var(--danger-line);
  background: var(--danger-ghost);
  font-size: var(--fs-label);
}
.ab-type {
  flex: none;
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
.ab-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: start;
  padding: 12px 0;
  border-bottom: 1px solid var(--line);
}
.ab-item .admin-btn {
  margin-top: 24px;
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
  position: sticky;
  bottom: calc(var(--admin-bottom-nav, 0px) + env(safe-area-inset-bottom));
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  /* Sangra até a borda do .admin-card (padding 20px). */
  margin: 18px -20px -20px;
  padding: 12px 20px;
  background: var(--paper);
  border-top: 1px solid var(--line);
  border-radius: 0 0 var(--r-md) var(--r-md);
}
.ab-state {
  font-size: var(--fs-label);
  color: var(--ink-soft);
}
.ab-state.ok {
  color: var(--ok);
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

/* ---- pré-visualização ---- */
.ab-layout {
  display: grid;
  gap: 20px;
  align-items: start;
}
.ab-previa {
  border: 1px solid var(--line-2);
  border-radius: var(--r-md);
  background: var(--paper);
  padding: 16px;
}
.ab-previa-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.ab-previa-head h2 {
  margin: 0;
  font-size: var(--fs-title-sm);
}
.ab-previa-pagina {
  margin-top: 14px;
  padding-top: 16px;
  border-top: 1px dashed var(--line-2);
}
@media (min-width: 1280px) {
  .ab-layout {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }
  /* A prévia acompanha a rolagem do formulário: editar o décimo bloco e ter de
     rolar a outra coluna até ele desfaz o "lado a lado". */
  .ab-previa {
    position: sticky;
    top: 16px;
    max-height: calc(100vh - 32px);
    overflow-y: auto;
  }
}
</style>

<style>
/* Global, e não scoped: o limite de 1000px é do layout do painel. Esta é a
   única tela que precisa de duas colunas largas — formulário e prévia —, e só
   em tela grande. */
@media (min-width: 1280px) {
  .admin-main:has(.ab-layout) {
    max-width: 1480px;
  }
}
</style>
