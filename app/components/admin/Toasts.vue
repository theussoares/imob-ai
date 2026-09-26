<script setup lang="ts">
import type { Toast } from "~/composables/useToast";

const { items, dismiss, clearErrors } = useToast();

// Erro de uma tela não segue a pessoa para a próxima: lá ele não diz respeito a
// nada que ela esteja vendo.
const route = useRoute();
watch(() => route.path, clearErrors);

const errors = computed(() => items.value.filter((t) => t.kind === "error"));
const successes = computed(() =>
  items.value.filter((t) => t.kind === "success"),
);

function runAction(t: Toast) {
  dismiss(t.id);
  t.action?.run();
}
</script>

<template>
  <!-- As duas regiões ficam sempre no DOM, mesmo vazias: leitor de tela só
       anuncia conteúdo inserido numa live region que já existia. Se o container
       nascesse junto com a mensagem, o aviso passaria em silêncio.
       Erro é `assertive` (interrompe); sucesso é `polite` (espera a vez). -->
  <div class="toasts">
    <div class="stack" role="alert" aria-live="assertive">
      <div v-for="t in errors" :key="t.id" class="toast err">
        <span>{{ t.message }}</span>
        <button
          type="button"
          class="x"
          aria-label="Dispensar aviso"
          @click="dismiss(t.id)"
        >
          ×
        </button>
      </div>
    </div>

    <div class="stack" role="status" aria-live="polite">
      <div v-for="t in successes" :key="t.id" class="toast ok">
        <span>{{ t.message }}</span>
        <button v-if="t.action" type="button" class="act" @click="runAction(t)">
          {{ t.action.label }}
        </button>
        <button
          type="button"
          class="x"
          aria-label="Dispensar aviso"
          @click="dismiss(t.id)"
        >
          ×
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.toasts {
  position: fixed;
  right: 16px;
  /* No TOPO. Embaixo eles cobriam a barra "Salvar alterações" da ficha do
     contrato, fixa no rodapé (e, no celular, disputavam o espaço com a
     navegação inferior): o aviso de erro tampava o botão que o resolveria. */
  top: calc(16px + env(safe-area-inset-top));
  z-index: 60;
  display: flex;
  flex-direction: column;
  gap: 8px;
  /* O container cobre o canto inteiro; sem isto ele engoliria cliques em quem
     está atrás mesmo sem nenhum aviso na tela. Os cards reativam o ponteiro. */
  pointer-events: none;
}
.stack {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.toast {
  pointer-events: auto;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  max-width: min(380px, calc(100vw - 32px));
  padding: 11px 12px 11px 14px;
  border-radius: var(--r-md);
  box-shadow: var(--shadow-lg);
  font-size: var(--fs-ui);
  line-height: 1.45;
  animation: toast-in 160ms ease-out;
}
.toast.err {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #7f1d1d;
}
.toast.ok {
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  color: #065f46;
}
.x {
  margin-left: auto;
  /* Área de toque de 32px: o × tinha ~12px de largura, e o "às vezes o X não
     fecha" do teste de 26/09 era o clique caindo ao lado dele. A margem
     negativa devolve o espaço para o card não crescer. */
  display: grid;
  place-items: center;
  flex: none;
  width: 32px;
  height: 32px;
  margin: -6px -6px -6px auto;
  border: none;
  border-radius: var(--r-sm);
  background: none;
  padding: 0;
  font-size: var(--fs-title-sm);
  line-height: 1;
  color: inherit;
  opacity: 0.65;
  cursor: pointer;
}
.x:hover {
  opacity: 1;
}
.act {
  margin-left: auto;
  border: none;
  background: none;
  padding: 0 2px;
  font: inherit;
  font-weight: 700;
  color: inherit;
  text-decoration: underline;
  cursor: pointer;
  white-space: nowrap;
}
/* Com a ação ao lado, o × não precisa mais empurrar para a direita. */
.act + .x {
  margin-left: 0;
}
@keyframes toast-in {
  from {
    opacity: 0;
    transform: translateY(-6px);
  }
}
@media (prefers-reduced-motion: reduce) {
  .toast {
    animation: none;
  }
}
@media (max-width: 640px) {
  .toasts {
    left: 16px;
    right: 16px;
  }
}
</style>
