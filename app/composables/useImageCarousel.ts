import type { PropertyImage } from "~~/shared/models/property";

/**
 * Índice ativo + navegação circular sobre uma lista de fotos do imóvel, com o
 * srcset de 640px/1600px que tanto a galeria da página de detalhe quanto o
 * carrossel do card usam do mesmo jeito.
 */
export function useImageCarousel(getImages: () => PropertyImage[]) {
  const activeIndex = ref(0);
  const activeImage = computed(() => getImages()[activeIndex.value] || null);
  // srcset só quando existe a derivada de 640px; imagem externa/antiga usa a original.
  const activeSrcset = computed(() =>
    activeImage.value?.urlSm ? `${activeImage.value.urlSm} 640w, ${activeImage.value.url} 1600w` : undefined,
  );
  const hasMany = computed(() => getImages().length > 1);

  function go(delta: number) {
    const n = getImages().length;
    if (n < 2) return;
    activeIndex.value = (activeIndex.value + delta + n) % n; // circular
  }

  return { activeIndex, activeImage, activeSrcset, hasMany, go };
}
