<script setup lang="ts">
/**
 * Carrossel manual e genérico — usado pela galeria de imagens e pelo time de
 * corretores da página "Quem somos".
 *
 * Deliberadamente SEM autoplay: pesquisa de UX (Nielsen Norman, diretrizes de
 * acessibilidade WAI-ARIA) aponta autoplay como o maior vilão de carrossel —
 * incomoda quem está lendo, atrapalha quem tem deficiência cognitiva e pode
 * disparar problema de acessibilidade com movimento. O scroll nativo do
 * navegador (setas, arrastar, roda do mouse, teclado com o container focado)
 * já cobre a navegação sem precisar de JS controlando índice — sobra menos
 * código e mais acessibilidade de graça.
 */
defineProps<{ label: string }>();

const track = ref<HTMLElement | null>(null);

function step(dir: number) {
  const el = track.value;
  if (!el) return;
  el.scrollBy({ left: el.clientWidth * 0.85 * dir, behavior: "smooth" });
}
</script>

<template>
  <div class="scroll-carousel">
    <button type="button" class="sc-nav sc-prev" :aria-label="`${label}: anterior`" @click="step(-1)">
      <AppIcon name="chevron-left" />
    </button>
    <div ref="track" class="sc-track" role="region" :aria-label="label" tabindex="0">
      <slot />
    </div>
    <button type="button" class="sc-nav sc-next" :aria-label="`${label}: próximo`" @click="step(1)">
      <AppIcon name="chevron-right" />
    </button>
  </div>
</template>

<style scoped>
.scroll-carousel {
  position: relative;
}
.sc-track {
  display: flex;
  gap: 16px;
  overflow-x: auto;
  scroll-snap-type: x proximity;
  scroll-behavior: smooth;
  padding: 2px 2px 10px;
  scrollbar-width: thin;
}
.sc-track :deep(> *) {
  flex: none;
  scroll-snap-align: start;
}
@media (prefers-reduced-motion: reduce) {
  .sc-track {
    scroll-behavior: auto;
  }
}
.sc-nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 1;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 1px solid var(--line-2);
  background: var(--paper);
  color: var(--ink);
  display: grid;
  place-items: center;
  cursor: pointer;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.12);
}
.sc-prev {
  left: -6px;
}
.sc-next {
  right: -6px;
}
@media (max-width: 640px) {
  /* Tela estreita: arrastar com o dedo já resolve, e a seta sobrando cobria
     o primeiro/último item do carrossel. */
  .sc-nav {
    display: none;
  }
}
</style>
