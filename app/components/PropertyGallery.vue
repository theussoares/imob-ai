<script setup lang="ts">
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
const activeIndex = ref(0);
const active = computed(() => props.images[activeIndex.value]?.url || "");
const hasMany = computed(() => props.images.length > 1);

const thumbStrip = ref<HTMLElement | null>(null);
const lbStrip = ref<HTMLElement | null>(null);

function go(delta: number) {
  const n = props.images.length;
  if (n < 2) return;
  activeIndex.value = (activeIndex.value + delta + n) % n; // circular
}

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

// Tela cheia
const lightboxOpen = ref(false);
const closeBtn = ref<HTMLButtonElement | null>(null);

async function openLightbox() {
  if (!active.value) return;
  lightboxOpen.value = true;
  await nextTick();
  closeBtn.value?.focus(); // acessibilidade: foco vai pro overlay
  // A tira do overlay acabou de nascer: se a pessoa abriu na foto 12, ela
  // precisa já aparecer destacada e visível, não lá no começo da fila.
  lbStrip.value
    ?.querySelectorAll<HTMLElement>(".lb-thumb")
    [activeIndex.value]?.scrollIntoView({ block: "nearest", inline: "center" });
}
function closeLightbox() {
  lightboxOpen.value = false;
}

// Teclado só enquanto a tela cheia está aberta.
onKeyStroke("Escape", () => lightboxOpen.value && closeLightbox());
onKeyStroke("ArrowRight", () => lightboxOpen.value && go(1));
onKeyStroke("ArrowLeft", () => lightboxOpen.value && go(-1));

// Arrastar/deslizar no mobile troca a imagem.
const lbImage = ref<HTMLElement | null>(null);
useSwipe(lbImage, {
  onSwipeEnd(_e, direction) {
    if (direction === "left") go(1);
    else if (direction === "right") go(-1);
  },
});

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
    <button
      type="button"
      class="gallery"
      aria-label="Ampliar imagem em tela cheia"
      @click="openLightbox"
    >
      <img
        :src="active"
        :alt="title"
        class="gallery-main"
        fetchpriority="high"
        decoding="async"
      />
      <span class="gallery-zoom"><AppIcon name="expand" /></span>
      <!-- aria-hidden: as miniaturas abaixo já dizem quantas são e qual é a
           atual, com rótulo próprio. Repetir aqui só polui o leitor de tela. -->
      <span v-if="hasMany" class="gallery-count" aria-hidden="true">
        {{ activeIndex + 1 }} / {{ images.length }}
      </span>
    </button>

    <div v-if="hasMany" ref="thumbStrip" class="thumbs">
      <button
        v-for="(img, i) in images"
        :key="img.id"
        class="thumb"
        :class="{ on: activeIndex === i }"
        :aria-label="`Foto ${i + 1} de ${images.length}`"
        :aria-current="activeIndex === i ? 'true' : undefined"
        @click="activeIndex = i"
      >
        <!-- thumb tem 84x60: usa a derivada pequena quando existe -->
        <img :src="img.urlSm || img.url" :alt="img.alt || title" loading="lazy" />
      </button>
    </div>

    <!-- Sem isto, abrir a tela cheia depende de a pessoa adivinhar que a foto é
         clicável. O ícone de ampliar ajuda, mas não diz quantas fotos existem. -->
    <button v-if="hasMany" type="button" class="see-all" @click="openLightbox">
      Ver todas as {{ images.length }} fotos
    </button>

    <Teleport to="body">
      <Transition name="lb">
        <div
          v-if="lightboxOpen"
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
              ref="lbImage"
              :src="active"
              :alt="title"
              class="lb-img"
              draggable="false"
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
              class="lb-thumb"
              :class="{ on: activeIndex === i }"
              :aria-label="`Foto ${i + 1} de ${images.length}`"
              :aria-current="activeIndex === i ? 'true' : undefined"
              @click="activeIndex = i"
            >
              <img :src="img.urlSm || img.url" :alt="img.alt || title" loading="lazy" />
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
  border-radius: 16px;
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
  border-radius: 10px;
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
/* Contador na foto principal, do lado oposto ao ícone de ampliar.
   tabular-nums: sem isso o "1 / 16" muda de largura ao virar "11 / 16" e o
   selo treme a cada troca de foto. */
.gallery-count {
  position: absolute;
  left: 12px;
  bottom: 12px;
  padding: 5px 11px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 13px;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
}
/* Em telas de toque não há hover: mostra a dica de ampliar sempre. */
@media (hover: none) {
  .gallery-zoom {
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
  border-radius: 10px;
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
  border-radius: 8px;
  /* Contorno tênue para a foto clara não se dissolver no fundo claro. */
  outline: 1px solid rgb(0 0 0 / 0.06);
  outline-offset: -1px;
}

.see-all {
  margin-top: 4px;
  padding: 9px 14px;
  min-height: 40px; /* área de toque */
  border: 1px solid var(--line);
  border-radius: 10px;
  background: transparent;
  color: var(--ink);
  font-size: 14px;
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
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
  cursor: pointer;
  transition: background-color 0.16s ease;
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
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
  font-size: 13px;
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
  border-radius: 8px;
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
  border-radius: 6px; /* concêntrico: 8px do botão menos a borda de 2px */
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
