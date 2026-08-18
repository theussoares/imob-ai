<script setup lang="ts">
const { expired, reconnect } = useSessionExpired();
const leaving = ref(false);

async function sair() {
  leaving.value = true;
  await reconnect();
}
</script>

<template>
  <!-- Fica grudado no topo, não em cima do conteúdo: a pessoa precisa alcançar
       o que digitou para copiar antes de sair. -->
  <div v-if="expired" class="bar" role="alert">
    <div class="txt">
      <strong>Sua sessão expirou.</strong>
      Nada vai ser salvo até você entrar de novo. Se estava preenchendo alguma
      coisa, copie o texto antes — sair recarrega a página.
    </div>
    <button class="btn" :disabled="leaving" @click="sair">
      {{ leaving ? "Saindo..." : "Entrar de novo" }}
    </button>
  </div>
</template>

<style scoped>
.bar {
  position: sticky;
  top: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
  padding: 12px 16px;
  margin-bottom: 16px;
  border-radius: 10px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #7f1d1d;
  font-size: 14px;
  line-height: 1.5;
  box-shadow: var(--shadow);
}
.txt {
  flex: 1;
  min-width: 220px;
}
.btn {
  border: none;
  border-radius: 8px;
  background: #b91c1c;
  color: #fff;
  font: inherit;
  font-weight: 600;
  padding: 8px 16px;
  cursor: pointer;
  white-space: nowrap;
}
.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
