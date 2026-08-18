<script setup lang="ts">
const { request, settle } = useConfirm();
const dialog = ref<HTMLDialogElement | null>(null);

// `showModal()` (e não o atributo `open`) é o que ativa focus trap, Esc e
// backdrop do elemento nativo. Com `open` sozinho, o <dialog> vira uma div.
watch(request, async (req) => {
  await nextTick();
  const d = dialog.value;
  if (!d) return;
  if (req && !d.open) d.showModal();
  else if (!req && d.open) d.close();
});

// Fechou sem passar pelos botões: sem isto a promise ficaria pendurada e o
// `await askConfirm(...)` de quem chamou nunca continuaria.
//
// Escuta os DOIS eventos de propósito. O Esc dispara `cancel` e depois `close`;
// um `close()` programático dispara só `close`. São garantias independentes da
// spec, e `settle` é idempotente — o que chegar primeiro resolve, o segundo não
// faz nada. Este caminho não é verificável no navegador embutido do ambiente de
// desenvolvimento (ele não despacha `close` nem para um <dialog> avulso, criado
// fora do Vue), então vale redundância em vez de confiar num evento só.
function onDismiss() {
  settle(false);
}
</script>

<template>
  <dialog
    ref="dialog"
    class="confirm"
    @close="onDismiss"
    @cancel="onDismiss"
    @click.self="settle(false)"
  >
    <!-- @click.self: clique no backdrop cai no próprio <dialog>, não num filho. -->
    <div v-if="request" class="box">
      <h2 class="t">{{ request.title }}</h2>
      <p v-if="request.description" class="d">{{ request.description }}</p>
      <div class="actions">
        <!-- autofocus no Cancelar, não no confirmar: com o foco na ação
             destrutiva, um Enter distraído apagaria o registro. -->
        <button
          type="button"
          class="admin-btn ghost"
          autofocus
          @click="settle(false)"
        >
          {{ request.cancelLabel || "Cancelar" }}
        </button>
        <button
          type="button"
          class="admin-btn"
          :class="{ danger: request.danger }"
          @click="settle(true)"
        >
          {{ request.confirmLabel || "Confirmar" }}
        </button>
      </div>
    </div>
  </dialog>
</template>

<style scoped>
.confirm {
  padding: 0;
  border: none;
  border-radius: 14px;
  background: var(--paper);
  color: inherit;
  box-shadow: var(--shadow-lg);
  max-width: min(420px, calc(100vw - 32px));
}
.confirm::backdrop {
  background: rgba(20, 22, 26, 0.45);
}
.box {
  padding: 20px;
}
.t {
  font-family: "Space Grotesk", sans-serif;
  font-size: 17px;
  line-height: 1.35;
  margin: 0;
}
.d {
  margin: 8px 0 0;
  color: var(--ink-soft);
  font-size: 14px;
  line-height: 1.5;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 18px;
}
</style>
