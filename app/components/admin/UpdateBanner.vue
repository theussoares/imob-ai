<script setup lang="ts">
const { temAtualizacao, aplicarAtualizacao } = usePwaUpdate();
const atualizando = ref(false);

async function atualizar() {
  atualizando.value = true;
  await aplicarAtualizacao();
}
</script>

<template>
  <!-- Avisa, não age. O service worker novo fica esperando (skipWaiting está
       desligado): trocar o código sozinho recarregaria a página no meio de um
       cadastro e perderia o formulário. Quem escolhe a hora é quem está
       usando — por isso o texto diz que recarrega. -->
  <div v-if="temAtualizacao" class="bar" role="status">
    <div class="txt">
      <strong>Nova versão disponível.</strong>
      Atualize quando terminar o que está fazendo — a página recarrega.
    </div>
    <button class="btn" :disabled="atualizando" @click="atualizar">
      {{ atualizando ? "Atualizando..." : "Atualizar agora" }}
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
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  color: #1e3a5f;
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
  background: var(--brand, #0f3d38);
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
