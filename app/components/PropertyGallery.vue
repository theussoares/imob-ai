<script setup lang="ts">
import type { ComponentPublicInstance } from "vue";
import type { PropertyImage } from "~~/shared/models/property";

/**
 * Galeria do imóvel: foto grande, tira de miniaturas e visualização em tela
 * cheia.
 *
 * Saiu da página de detalhe porque aquele arquivo fazia galeria, SEO, JSON-LD e
 * formulário de lead ao mesmo tempo. Aqui a galeria é uma coisa só, com estado
 * próprio.
 *
 * As miniaturas ficam numa tira que ROLA na horizontal, não numa grade que
 * quebra linha. Com 16 fotos a grade virava cinco fileiras empilhadas e
 * empurrava preço, descrição e contato para fora da primeira tela no celular —
 * justamente o conteúdo que decide a visita.
 */
const props = defineProps<{
  images: PropertyImage[];
  title: string;
}>();

// Galeria controlada por índice (não por URL): é o que permite navegar
// anterior/próxima na tela cheia e destacar a miniatura certa.
const {
  activeIndex,
  activeImage,
  activeSrc: active,
  activeSrcset,
  hasMany,
  go,
  imageLoading,
  onImageLoad,
  bindImg,
} = useImageCarousel(() => props.images, { full: true });

const thumbStrip = ref<HTMLElement | null>(null);
const lbStrip = ref<HTMLElement | null>(null);

/**
 * Navegar pelas setas ou pelo swipe move a miniatura ativa junto. Sem isto, na
 * décima foto o destaque estaria fora da área visível da tira e a pessoa perde
 * a noção de onde está.
 */
watch(activeIndex, async (i) => {
  await nextTick();
  // As duas tiras: a da página e a da tela cheia. Quem navega pelo teclado
  // dentro do overlay precisa ver a miniatura ativa acompanhar ali também.
  //
  // O alinhamento tem que casar com o `scroll-snap-align` de cada tira, senão os
  // dois brigam: o scroll põe a miniatura na borda e o snap a empurra de volta
  // para fora. Na página o snap é `start`; no overlay é `center`.
  for (const [strip, sel, inline] of [
    [thumbStrip.value, ".thumb", "nearest"],
    [lbStrip.value, ".lb-thumb", "center"],
  ] as const) {
    strip
      ?.querySelectorAll<HTMLElement>(sel)
      [i]?.scrollIntoView({ block: "nearest", inline, behavior: "smooth" });
  }
});

/**
 * Texto alternativo da foto ATUAL.
 *
 * Todas as fotos usavam o título do imóvel: para quem ouve a página, trocar de
 * foto repetia "Casa em Jardim das Américas" e não havia como saber se a foto
 * tinha mudado. O `alt` cadastrado vence; sem ele, a posição ao menos diz que
 * é outra foto.
 */
const activeAlt = computed(() => {
  const own = activeImage.value?.alt?.trim();
  if (own) return own;
  return hasMany.value
    ? `${props.title} — foto ${activeIndex.value + 1} de ${props.images.length}`
    : props.title;
});

// Tela cheia
const lightboxOpen = ref(false);
const closeBtn = ref<HTMLButtonElement | null>(null);
const lightboxEl = ref<HTMLElement | null>(null);
/** Quem abriu a tela cheia — é para lá que o foco volta ao fechar. */
let openerEl: HTMLElement | null = null;

async function openLightbox() {
  if (!active.value) return;
  openerEl = import.meta.client ? (document.activeElement as HTMLElement | null) : null;
  lightboxOpen.value = true;
  await nextTick();
  closeBtn.value?.focus(); // acessibilidade: foco vai pro overlay
  // A tira do overlay acabou de nascer: se a pessoa abriu na foto 12, ela
  // precisa já aparecer destacada e visível, não lá no começo da fila.
  lbStrip.value
    ?.querySelectorAll<HTMLElement>(".lb-thumb")
    [activeIndex.value]?.scrollIntoView({ block: "nearest", inline: "center" });
}
/**
 * Devolve o foco a quem abriu. Sem isto o foco caía no `<body>` ao fechar, e
 * quem navega por teclado voltava ao topo da página, tendo de tabular tudo de
 * novo até a galeria (padrão de diálogo da WAI-ARIA APG).
 */
async function closeLightbox() {
  lightboxOpen.value = false;
  await nextTick();
  openerEl?.focus();
  openerEl = null;
}

/**
 * Prende o Tab dentro do diálogo. `aria-modal` avisa o leitor de tela, mas não
 * segura o teclado: sem isto o Tab saía da tela cheia e ia focando links da
 * página ESCONDIDA atrás do overlay, sem nada visível mudar.
 */
onKeyStroke("Tab", (e) => {
  if (!lightboxOpen.value || !lightboxEl.value) return;
  const focaveis = [
    ...lightboxEl.value.querySelectorAll<HTMLElement>("button:not([disabled]), [href], [tabindex]:not([tabindex='-1'])"),
  ];
  if (!focaveis.length) return;
  const primeiro = focaveis[0]!;
  const ultimo = focaveis[focaveis.length - 1]!;
  const atual = document.activeElement;
  if (e.shiftKey && (atual === primeiro || !lightboxEl.value.contains(atual))) {
    e.preventDefault();
    ultimo.focus();
  } else if (!e.shiftKey && (atual === ultimo || !lightboxEl.value.contains(atual))) {
    e.preventDefault();
    primeiro.focus();
  }
});

// Teclado só enquanto a tela cheia está aberta.
onKeyStroke("Escape", () => lightboxOpen.value && closeLightbox());
onKeyStroke("ArrowRight", () => lightboxOpen.value && go(1));
onKeyStroke("ArrowLeft", () => lightboxOpen.value && go(-1));

// Arrastar/deslizar no mobile troca a imagem.
const lbImage = ref<HTMLElement | null>(null);
// A tela cheia entra/sai via v-if: o elemento é recriado a cada abertura, e
// `bindImg` precisa rodar de novo em cada uma pra pegar uma foto que já
// estava em cache (ver comentário em useImageCarousel).
function bindLbImage(el: Element | ComponentPublicInstance | null) {
  lbImage.value = el instanceof HTMLElement ? el : null;
  bindImg(el);
}
useSwipe(lbImage, {
  onSwipeEnd(_e, direction) {
    if (direction === "left") go(1);
    else if (direction === "right") go(-1);
  },
});

/**
 * Setas e swipe na foto principal, sem precisar abrir a tela cheia — a
 * `.gallery` é um `<button>` cujo clique abre a tela cheia, então um arraste
 * não pode terminar acionando esse clique junto. Mesma trava do carrossel do
 * card: um swipe marca `justSwiped`, e o clique seguinte (sintetizado pelo
 * navegador ao soltar o dedo) é engolido em vez de abrir a tela cheia.
 */
const mainStage = ref<HTMLElement | null>(null);
let justSwipedMain = false;
useSwipe(mainStage, {
  onSwipeEnd(_e, direction) {
    justSwipedMain = true;
    if (direction === "left") go(1);
    else if (direction === "right") go(-1);
  },
});
function onGalleryClick() {
  if (justSwipedMain) {
    justSwipedMain = false;
    return;
  }
  openLightbox();
}

// Trava o scroll do fundo enquanto o overlay está aberto.
watch(lightboxOpen, (open) => {
  if (import.meta.client) {
    document.documentElement.style.overflow = open ? "hidden" : "";
  }
});
onBeforeUnmount(() => {
  if (import.meta.client) document.documentElement.style.overflow = "";
});
</script>

<template>
  <div v-if="active">
    <!--
      Não é mais um <button>: as setas de navegação vivem AQUI DENTRO agora, e
      <button> dentro de <button> é HTML inválido (conteúdo interativo dentro
      de conteúdo interativo). `role="button"` + tabindex + Enter/Espaço
      repõem à mão o que o elemento nativo dava de graça.
    -->
    <div
      ref="mainStage"
      class="gallery"
      role="button"
      tabindex="0"
      aria-label="Ampliar imagem em tela cheia"
      @click="onGalleryClick"
      @keydown.enter="onGalleryClick"
      @keydown.space.prevent="onGalleryClick"
    >
      <img
        :ref="bindImg"
        :src="active"
        :srcset="activeSrcset"
        sizes="(min-width: 900px) 740px, 100vw"
        :alt="activeAlt"
        class="gallery-main"
        fetchpriority="high"
        decoding="async"
        @load="onImageLoad"
        @error="onImageLoad"
      />
      <div
        class="img-spinner"
        :class="{ on: imageLoading }"
        aria-hidden="true"
      />
      <span class="gallery-zoom"><AppIcon name="expand" /></span>
      <!-- aria-hidden: as miniaturas abaixo já dizem quantas são e qual é a
           atual, com rótulo próprio. Repetir aqui só polui o leitor de tela. -->
      <span v-if="hasMany" class="gallery-count" aria-hidden="true">
        {{ activeIndex + 1 }} / {{ images.length }}
      </span>
      <template v-if="hasMany">
        <button
          type="button"
          class="gallery-nav gallery-prev"
          aria-label="Foto anterior"
          @click.stop="go(-1)"
        >
          <AppIcon name="chevron-left" />
        </button>
        <button
          type="button"
          class="gallery-nav gallery-next"
          aria-label="Próxima foto"
          @click.stop="go(1)"
        >
          <AppIcon name="chevron-right" />
        </button>
      </template>
    </div>

    <!-- <div v-if="hasMany" ref="thumbStrip" class="thumbs">
      <button
        v-for="(img, i) in images"
        :key="img.id"
        class="thumb"
        :class="{ on: activeIndex === i }"
        :aria-label="`Foto ${i + 1} de ${images.length}`"
        :aria-current="activeIndex === i ? 'true' : undefined"
        @click="activeIndex = i"
      > -->
    <!-- thumb tem 84x60: usa a derivada pequena quando existe -->
    <!-- <img :src="img.urlSm || img.url" :alt="img.alt || title" loading="lazy" />
      </button>
    </div> -->

    <!-- Sem isto, abrir a tela cheia depende de a pessoa adivinhar que a foto é
         clicável. O ícone de ampliar ajuda, mas não diz quantas fotos existem. -->
    <button v-if="hasMany" type="button" class="see-all" @click="openLightbox">
      Ver todas as {{ images.length }} fotos
    </button>

    <Teleport to="body">
      <Transition name="lb">
        <div
          v-if="lightboxOpen"
          ref="lightboxEl"
          class="lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Galeria de imagens"
          @click.self="closeLightbox"
        >
          <button
            ref="closeBtn"
            type="button"
            class="lb-close"
            aria-label="Fechar"
            @click="closeLightbox"
          >
            <AppIcon name="close" />
          </button>

          <!-- A imagem vive num palco próprio para que a tira de miniaturas
               abaixo tire altura dela, em vez de cobri-la — e para que as setas
               centralizem na imagem, não na tela inteira. -->
          <div class="lb-stage" @click.self="closeLightbox">
            <button
              v-if="hasMany"
              type="button"
              class="lb-nav lb-prev"
              aria-label="Imagem anterior"
              @click="go(-1)"
            >
              <AppIcon name="chevron-left" />
            </button>

            <img
              :ref="bindLbImage"
              :src="active"
              :srcset="activeSrcset"
              sizes="100vw"
              :alt="activeAlt"
              class="lb-img"
              draggable="false"
              @load="onImageLoad"
              @error="onImageLoad"
            />
            <div
              class="img-spinner"
              :class="{ on: imageLoading }"
              aria-hidden="true"
            />

            <button
              v-if="hasMany"
              type="button"
              class="lb-nav lb-next"
              aria-label="Próxima imagem"
              @click="go(1)"
            >
              <AppIcon name="chevron-right" />
            </button>
          </div>

          <div v-if="hasMany" ref="lbStrip" class="lb-thumbs">
            <button
              v-for="(img, i) in images"
              :key="img.id"
              type="button"
              class="lb-thumb"
              :class="{ on: activeIndex === i }"
              :aria-label="`Foto ${i + 1} de ${images.length}`"
              :aria-current="activeIndex === i ? 'true' : undefined"
              @click="activeIndex = i"
            >
              <!-- alt vazio: o botão já se chama "Foto 3 de 12"; o título do
                   imóvel repetido em cada miniatura só alongava o anúncio. -->
              <img
                :src="img.urlSm || img.url"
                alt=""
                loading="lazy"
              />
            </button>
          </div>

          <div v-if="hasMany" class="lb-count">
            {{ activeIndex + 1 }} / {{ images.length }}
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.gallery {
  display: block;
  width: 100%;
  position: relative;
  aspect-ratio: 16/10;
  border-radius: var(--r-lg);
  overflow: hidden;
  background: #cdd6cf;
  box-shadow: var(--shadow);
  padding: 0;
  border: none;
  cursor: zoom-in;
}
.gallery-main {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.4s ease;
}
.gallery:hover .gallery-main {
  transform: scale(1.03);
}
.gallery-zoom {
  position: absolute;
  right: 12px;
  bottom: 12px;
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: var(--r-md);
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  opacity: 0;
  transition: opacity 0.2s ease;
}
.gallery:hover .gallery-zoom,
.gallery:focus-visible .gallery-zoom {
  opacity: 1;
}
.gallery-zoom :deep(svg) {
  width: 20px;
  height: 20px;
}
.gallery-nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  /* Explícito, não herdado da ordem no DOM: foi exatamente a falta disso na
     seta esquerda da tela cheia (`.lb-prev`, que vem ANTES da foto no HTML)
     que a deixava atrás da imagem em fotos que preenchem a largura toda. */
  z-index: 1;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border: none;
  border-radius: var(--r-pill);
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  opacity: 0;
  cursor: pointer;
  transition:
    opacity 0.2s ease,
    background-color 0.16s ease;
}
.gallery:hover .gallery-nav,
.gallery-nav:focus-visible {
  opacity: 1;
}
.gallery-nav:hover {
  background: rgba(0, 0, 0, 0.65);
}
.gallery-nav :deep(svg) {
  width: 22px;
  height: 22px;
}
.gallery-prev {
  left: 12px;
}
.gallery-next {
  right: 12px;
}
/* Sinal de que a foto ativa ainda não chegou — sem isto, trocar de foto (seta,
   swipe ou miniatura) e ela ainda não ter carregado parece que o toque não fez
   nada, porque o <img> fica em branco até decodificar. O atraso de 0.15s só
   entra na ENTRADA (`.on`): uma foto em cache carrega rápido demais pro
   spinner chegar a aparecer, então ele nunca pisca à toa. */
.img-spinner {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.15s ease;
}
.img-spinner.on {
  opacity: 1;
  transition-delay: 0.15s;
}
.img-spinner::after {
  content: "";
  box-sizing: border-box;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.45);
  border: 3px solid rgba(255, 255, 255, 0.35);
  border-top-color: #fff;
  animation: img-spin 0.7s linear infinite;
}
@keyframes img-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .img-spinner,
  .img-spinner.on {
    transition: none;
  }
  .img-spinner::after {
    animation: none;
  }
}
/* Contador na foto principal, do lado oposto ao ícone de ampliar.
   tabular-nums: sem isso o "1 / 16" muda de largura ao virar "11 / 16" e o
   selo treme a cada troca de foto. */
.gallery-count {
  position: absolute;
  left: 12px;
  bottom: 12px;
  padding: 5px 11px;
  border-radius: var(--r-pill);
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: var(--fs-label);
  line-height: 1;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
}
/* Em telas de toque não há hover: mostra a dica de ampliar sempre. */
@media (hover: none) {
  .gallery-zoom,
  .gallery-nav {
    opacity: 1;
  }
}

/* ---- Tira de miniaturas ---- */
.thumbs {
  display: flex;
  gap: 10px;
  margin-top: 10px;
  /* Rola na horizontal em vez de quebrar linha. Com 16 fotos, a grade antiga
     empilhava cinco fileiras e jogava o conteúdo do imóvel para fora da tela. */
  overflow-x: auto;
  scroll-snap-type: x proximity;
  scrollbar-width: thin;
  /* Respiro para a sombra do foco não ser cortada pelo overflow. */
  padding: 2px 2px 8px;
  margin-left: -2px;
  margin-right: -2px;
}
.thumb {
  /* flex-shrink 0: sem isto o flex espreme todas para caber e o "peek" some. */
  flex: 0 0 auto;
  width: 84px;
  height: 60px;
  border-radius: var(--r-md);
  overflow: hidden;
  border: 2px solid transparent;
  padding: 0;
  background: none;
  scroll-snap-align: start;
  cursor: pointer;
  transition:
    border-color 0.16s ease,
    scale 0.16s ease;
}
.thumb:active {
  scale: 0.96;
}
.thumb.on {
  border-color: var(--brand);
}
.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  /* Concêntrico: 10px do botão menos os 2px da borda. */
  border-radius: var(--r-sm);
  /* Contorno tênue para a foto clara não se dissolver no fundo claro. */
  outline: 1px solid rgb(0 0 0 / 0.06);
  outline-offset: -1px;
}

.see-all {
  margin-top: 4px;
  padding: 9px 14px;
  min-height: 44px; /* área de toque */
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: transparent;
  color: var(--ink);
  font-size: var(--fs-ui);
  font-weight: 500;
  cursor: pointer;
  transition:
    background-color 0.16s ease,
    border-color 0.16s ease,
    scale 0.16s ease;
}
.see-all:hover {
  background: var(--surface);
  border-color: var(--line-2);
}
.see-all:active {
  scale: 0.96;
}

/* ---- Tela cheia ---- */
.lightbox {
  position: fixed;
  inset: 0;
  z-index: 100;
  /* Coluna: o palco ocupa o que sobra e a tira fica embaixo, tirando altura da
     imagem em vez de cobri-la. */
  display: flex;
  flex-direction: column;
  background: rgba(0, 0, 0, 0.92);
  padding: 24px;
  gap: 14px;
}
.lb-stage {
  position: relative;
  flex: 1;
  /* min-height 0 é o que permite o flex encolher o palco abaixo do tamanho
     natural da imagem — sem isto a tira é empurrada para fora da tela. */
  min-height: 0;
}
/**
 * Posicionada em absoluto de propósito, não centralizada por grid.
 *
 * Como item de grid com linha de altura automática, o `max-height: 100%` da
 * imagem resolvia contra uma altura indefinida e era simplesmente ignorado: a
 * foto renderizava no tamanho natural e vazava para fora do palco. Uma foto de
 * 1200x1600 estourava 998px num palco de 602px de altura, e o desktop mostrava
 * só o pedaço de cima. No celular passava batido porque ali a largura
 * constrange primeiro.
 *
 * Com `inset: 0` o bloco recipiente tem dimensões definidas, então as duas
 * restrições passam a valer; `margin: auto` centraliza nos dois eixos.
 */
.lb-img {
  position: absolute;
  inset: 0;
  margin: auto;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  user-select: none;
}
.lb-close,
.lb-nav {
  position: absolute;
  display: grid;
  place-items: center;
  border: none;
  border-radius: var(--r-pill);
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
  cursor: pointer;
  transition: background-color 0.16s ease;
}
/* `.lb-prev` vem ANTES do `.lb-img` no DOM, e os dois têm z-index automático
   — nessa disputa, quem vem depois pinta por cima. Numa foto que preenche a
   largura toda do palco (a maioria em pé no celular), a imagem cobria a seta
   esquerda por inteiro; a direita só escapava por vir depois dela no HTML. */
.lb-nav {
  z-index: 1;
}
.lb-close:hover,
.lb-nav:hover {
  background: rgba(255, 255, 255, 0.26);
}
.lb-close:focus-visible,
.lb-nav:focus-visible {
  outline: 2px solid #fff;
  outline-offset: 2px;
}
.lb-close {
  top: 16px;
  right: 16px;
  width: 44px;
  height: 44px;
}
.lb-close :deep(svg) {
  width: 22px;
  height: 22px;
}
.lb-nav {
  top: 50%;
  transform: translateY(-50%);
  width: 48px;
  height: 48px;
}
.lb-nav :deep(svg) {
  width: 26px;
  height: 26px;
}
.lb-prev {
  left: 16px;
}
.lb-next {
  right: 16px;
}
/* Sobe para o topo: o rodapé agora é da tira de miniaturas. Fica à esquerda
   porque o botão de fechar já ocupa a direita — mover o "fechar" de lugar
   quebraria o hábito de quem já usa a galeria. */
.lb-count {
  position: absolute;
  top: 26px;
  left: 24px;
  padding: 5px 12px;
  border-radius: var(--r-pill);
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
  font-size: var(--fs-label);
  line-height: 1;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
}

/* ---- Tira de miniaturas dentro da tela cheia ---- */
.lb-thumbs {
  flex: 0 0 auto;
  display: flex;
  gap: 8px;
  overflow-x: auto;
  scroll-snap-type: x proximity;
  justify-content: safe center; /* centraliza quando cabem; alinha à esquerda quando não */
  padding: 2px;
  scrollbar-width: thin;
}
.lb-thumb {
  flex: 0 0 auto;
  width: 72px;
  height: 52px;
  border-radius: var(--r-sm);
  overflow: hidden;
  border: 2px solid transparent;
  padding: 0;
  background: none;
  cursor: pointer;
  opacity: 0.55;
  scroll-snap-align: center;
  transition:
    opacity 0.16s ease,
    border-color 0.16s ease,
    scale 0.16s ease;
}
.lb-thumb:hover {
  opacity: 0.85;
}
.lb-thumb:active {
  scale: 0.96;
}
/* Escurecer as inativas em vez de só marcar a ativa: no fundo preto do overlay
   uma borda fina some, mas diferença de brilho se lê de relance. */
.lb-thumb.on {
  opacity: 1;
  border-color: #fff;
}
.lb-thumb:focus-visible {
  outline: 2px solid #fff;
  outline-offset: 2px;
  opacity: 1;
}
.lb-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: var(--r-sm); /* concêntrico: 8px do botão menos a borda de 2px */
}
/* Telas baixas (celular deitado): a tira come altura demais da foto. */
@media (max-height: 460px) {
  .lb-thumbs {
    display: none;
  }
}
/* Fade de entrada e saída do overlay. */
.lb-enter-active,
.lb-leave-active {
  transition: opacity 0.2s ease;
}
.lb-enter-from,
.lb-leave-to {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .gallery-main,
  .gallery:hover .gallery-main,
  .gallery-nav,
  .thumb,
  .see-all,
  .lb-thumb,
  .lb-enter-active,
  .lb-leave-active {
    transition: none;
  }
  .thumb:active,
  .see-all:active,
  .lb-thumb:active {
    scale: 1;
  }
  .thumbs,
  .lb-thumbs {
    scroll-behavior: auto;
  }
}
</style>
