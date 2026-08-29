<script setup lang="ts">
import type { PropertyImage } from "~~/shared/models/property";

/**
 * Carrossel de fotos dentro do card do catálogo (grid da home, categorias e
 * `quero-vender`). Mostra uma foto por vez — trocar de foto troca o `src`, não
 * baixa as até 5 fotos do card de uma vez.
 *
 * A foto fica ACIMA da camada invisível que torna o `.prop` inteiro clicável
 * (ver `.ttl::after` em main.css, z-index 1) — senão o toque/arraste do swipe
 * nunca chegaria até aqui: só os 30px de cada seta ficariam sensíveis ao
 * gesto, porque só elas tinham esse z-index antes. Com a foto elevada, tocar
 * nela deixa de "cair" na camada do card por conta própria, então quem abre o
 * imóvel num tap simples é o `onTap` abaixo — não mais de graça pelo overlay.
 */
const props = withDefaults(
  defineProps<{
    images: PropertyImage[];
    alt: string;
    to: string;
    index?: number;
  }>(),
  { index: 99 },
);

const {
  activeImage,
  activeSrcset,
  hasMany,
  go,
  imageLoading,
  onImageLoad,
  bindImg,
} = useImageCarousel(() => props.images);
// Cards acima da dobra não podem ser lazy: em tenant sem hero image, a capa do
// primeiro card É o elemento de LCP, e lazy adia o download pro pós-layout.
const isAboveFold = computed(() => props.index < 3);

const stage = ref<HTMLElement | null>(null);
// Sinaliza que o gesto foi um arraste, não um toque: sem isto, um swipe lento
// (que o navegador às vezes ainda sintetiza como clique ao soltar o dedo)
// trocaria a foto E navegaria pro imóvel no mesmo gesto.
let justSwiped = false;
// Com 1 foto só não há pra onde arrastar — sem essa guarda, toda listagem
// registraria um listener de swipe por card à toa (o `images` de um card não
// muda depois de montado, então checar isto uma vez no setup já basta).
if (hasMany.value) {
  useSwipe(stage, {
    onSwipeEnd(_e, direction) {
      justSwiped = true;
      if (direction === "left") go(1);
      else if (direction === "right") go(-1);
    },
  });
}

function onTap() {
  if (justSwiped) {
    justSwiped = false;
    return;
  }
  navigateTo(props.to);
}
</script>

<template>
  <div v-if="activeImage" ref="stage" class="cc" @click="onTap">
    <img
      :ref="bindImg"
      :src="activeImage.url"
      :srcset="activeSrcset"
      sizes="(min-width: 1040px) 360px, (min-width: 820px) 50vw, 100vw"
      :alt="alt"
      :loading="isAboveFold ? 'eager' : 'lazy'"
      :fetchpriority="index === 0 ? 'high' : 'auto'"
      decoding="async"
      @load="onImageLoad"
      @error="onImageLoad"
    />
    <div class="img-spinner" :class="{ on: imageLoading }" aria-hidden="true" />
    <template v-if="hasMany">
      <button
        type="button"
        class="cc-nav cc-prev"
        aria-label="Foto anterior"
        @click.stop="go(-1)"
      >
        <AppIcon name="chevron-left" />
      </button>
      <button
        type="button"
        class="cc-nav cc-next"
        aria-label="Próxima foto"
        @click.stop="go(1)"
      >
        <AppIcon name="chevron-right" />
      </button>
    </template>
  </div>
</template>
