<script setup lang="ts">
/**
 * Foto em tela cheia, com anterior/próxima — para a galeria do "Quem somos".
 *
 * Não é a tela cheia da galeria do imóvel reaproveitada inteira: aquela vive
 * amarrada ao carrossel da página de detalhe (índice compartilhado com a foto
 * principal, derivadas `urlSm` pré-geradas, tira de miniaturas). O que as duas
 * precisam ter IGUAL — foco, Tab preso, Esc, trava de scroll — mora em
 * `useModalDialog` e é o mesmo código nas duas.
 */
const props = defineProps<{
  images: { src: string; srcset?: string; alt: string }[];
  label: string;
}>();

const el = ref<HTMLElement | null>(null);
const closeBtn = ref<HTMLButtonElement | null>(null);
const { open, show, hide } = useModalDialog(el);

const index = ref(0);
const atual = computed(() => props.images[index.value]);
const varias = computed(() => props.images.length > 1);

function go(delta: number) {
  const n = props.images.length;
  if (n) index.value = (index.value + delta + n) % n;
}

onKeyStroke("ArrowRight", () => open.value && go(1));
onKeyStroke("ArrowLeft", () => open.value && go(-1));

const palco = ref<HTMLElement | null>(null);
useSwipe(palco, {
  onSwipeEnd(_e, direction) {
    if (direction === "left") go(1);
    else if (direction === "right") go(-1);
  },
});

defineExpose({
  abrir(i: number) {
    index.value = i;
    show(() => closeBtn.value);
  },
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open && atual"
      ref="el"
      class="ilb"
      role="dialog"
      aria-modal="true"
      :aria-label="label"
      @click.self="hide"
    >
      <button ref="closeBtn" type="button" class="ilb-btn ilb-close" aria-label="Fechar" @click="hide">
        <AppIcon name="close" />
      </button>
      <div v-if="varias" class="ilb-count" aria-live="polite">{{ index + 1 }} / {{ images.length }}</div>

      <div ref="palco" class="ilb-stage" @click.self="hide">
        <button v-if="varias" type="button" class="ilb-btn ilb-nav ilb-prev" aria-label="Foto anterior" @click="go(-1)">
          <AppIcon name="chevron-left" />
        </button>
        <img
          :key="atual.src"
          :src="atual.src"
          :srcset="atual.srcset || undefined"
          sizes="100vw"
          :alt="atual.alt || `Foto ${index + 1} de ${images.length}`"
          class="ilb-img"
          draggable="false"
        />
        <button v-if="varias" type="button" class="ilb-btn ilb-nav ilb-next" aria-label="Próxima foto" @click="go(1)">
          <AppIcon name="chevron-right" />
        </button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* Mesma linguagem da tela cheia do imóvel: fundo quase preto, botões
   translúcidos de 44–48px, contagem no canto. */
.ilb {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  background: rgba(0, 0, 0, 0.92);
  padding: 24px;
}
.ilb-stage {
  position: relative;
  flex: 1;
}
.ilb-img {
  position: absolute;
  inset: 0;
  margin: auto;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  user-select: none;
}
.ilb-btn {
  position: absolute;
  z-index: 1;
  display: grid;
  place-items: center;
  border: none;
  border-radius: var(--r-pill);
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
  cursor: pointer;
  transition: background-color 0.16s ease;
}
.ilb-btn:hover,
.ilb-btn:focus-visible {
  background: rgba(255, 255, 255, 0.26);
}
.ilb-close {
  top: 16px;
  right: 16px;
  width: 44px;
  height: 44px;
}
.ilb-nav {
  top: 50%;
  transform: translateY(-50%);
  width: 48px;
  height: 48px;
}
.ilb-prev {
  left: 0;
}
.ilb-next {
  right: 0;
}
.ilb-count {
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
}
@media (prefers-reduced-motion: reduce) {
  .ilb-btn {
    transition: none;
  }
}
</style>
