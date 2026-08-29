import type { ComponentPublicInstance } from "vue";
import type { PropertyImage } from "~~/shared/models/property";

/**
 * Índice ativo + navegação circular sobre uma lista de fotos do imóvel, com o
 * srcset de 640px/1600px que tanto a galeria da página de detalhe quanto o
 * carrossel do card usam do mesmo jeito.
 */
export function useImageCarousel(getImages: () => PropertyImage[]) {
  const activeIndex = ref(0);
  const activeImage = computed(() => getImages()[activeIndex.value] || null);
  // Testando o endpoint de transformação do Supabase no lugar da derivada
  // `urlSm` pré-gerada: as duas larguras do srcset saem sob demanda da mesma
  // `url` original. Imagem externa cai na própria URL, sem transformação.
  const activeSrcset = computed(() => {
    const url = activeImage.value?.url;
    if (!url) return undefined;
    return [
      `${supabaseRenderImage(url, { width: 280, height: 280, quality: 70 })} 280w`,
      `${supabaseRenderImage(url, { width: 360, height: 360, quality: 70 })} 360w`,
    ].join(", ");
  });
  const hasMany = computed(() => getImages().length > 1);

  function go(delta: number) {
    const n = getImages().length;
    if (n < 2) return;
    activeIndex.value = (activeIndex.value + delta + n) % n; // circular
  }

  /**
   * Sem isto, trocar de foto (seta, swipe ou miniatura) e ela ainda não ter
   * chegado dá a impressão de que o toque não fez nada — o `<img>` fica em
   * branco até decodificar, sem nenhum sinal de que uma troca está em curso.
   */
  const imageLoading = ref(true);
  watch(activeImage, () => {
    imageLoading.value = true;
  });
  function onImageLoad() {
    imageLoading.value = false;
  }
  /**
   * `:ref="bindImg"` no `<img>`, no lugar de `onMounted`: no SSR o `<img>` já
   * nasce com `src` no HTML, e o navegador pode terminar de baixá-lo (foto
   * pequena/em cache) ANTES da hidratação ligar o `@load` — perdendo o evento
   * pra sempre e deixando o spinner girando eternamente na primeira foto.
   * Function ref roda de novo sempre que o elemento é recriado (a foto da
   * tela cheia, que entra/sai via `v-if`), então cobre os dois casos com o
   * mesmo código.
   */
  function bindImg(el: Element | ComponentPublicInstance | null) {
    if (el instanceof HTMLImageElement && el.complete) onImageLoad();
  }

  return { activeIndex, activeImage, activeSrcset, hasMany, go, imageLoading, onImageLoad, bindImg };
}
