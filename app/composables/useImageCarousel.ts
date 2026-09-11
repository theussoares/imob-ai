import type { ComponentPublicInstance } from "vue";
import type { PropertyImage } from "~~/shared/models/property";

/**
 * Índice ativo + navegação circular sobre uma lista de fotos do imóvel.
 *
 * O srcset usa as derivadas WebP já geradas NO UPLOAD (`urlSm` 640px, `url`
 * 1600px — ver ImageUploader.vue), não o endpoint de transformação sob
 * demanda do Supabase. Cada foto transformada sob demanda conta contra a cota
 * paga de "Image Transformations" da conta — e como toda foto de todo imóvel
 * de todo tenant passava por ali pra montar QUALQUER tamanho de srcset, a
 * plataforma inteira estourou a cota rápido. As derivadas do upload já
 * resolvem os dois tamanhos que a UI usa (thumb/card e galeria/tela cheia) sem
 * custo por requisição — só falta quando a foto não passou pelo uploader
 * (URL colada à mão, ou formato que o canvas não processa: SVG/HEIC), caso em
 * que `urlSm` vem `null` e o `<img>` cai só na `url` original.
 */
export function useImageCarousel(getImages: () => PropertyImage[]) {
  const activeIndex = ref(0);
  const activeImage = computed(() => getImages()[activeIndex.value] || null);
  const activeSrcset = computed(() => {
    const img = activeImage.value;
    if (!img?.url || !img.urlSm) return undefined;
    return `${img.urlSm} 640w, ${img.url} 1600w`;
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
