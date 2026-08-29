import type { ComponentPublicInstance } from "vue";
import type { PropertyImage } from "~~/shared/models/property";

/**
 * Índice ativo + navegação circular sobre uma lista de fotos do imóvel. O
 * srcset (1x/2x) sai sob demanda do endpoint de transformação do Supabase, a
 * partir da `url` original — sem depender da derivada `urlSm` pré-gerada no
 * upload. `baseWidth` é a largura 1x: o card da listagem usa uma (pequena) e
 * a galeria da página de detalhe usa outra (maior) — por isso é parâmetro, não
 * uma constante fixa aqui dentro.
 */
export function useImageCarousel(getImages: () => PropertyImage[], baseWidth = 360) {
  const activeIndex = ref(0);
  const activeImage = computed(() => getImages()[activeIndex.value] || null);
  const activeSrcset = computed(() => {
    const url = activeImage.value?.url;
    if (!url) return undefined;
    return [
      `${supabaseRenderImage(url, { width: baseWidth, height: baseWidth, quality: 70 })} ${baseWidth}w`,
      `${supabaseRenderImage(url, { width: baseWidth * 2, height: baseWidth * 2, quality: 70 })} ${baseWidth * 2}w`,
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
