<script setup lang="ts">
/**
 * Falha ao carregar uma lista do painel.
 *
 * As listas nascem com `default: () => []`, então uma requisição que falha
 * deixava a lista VAZIA — e a tela dizia "Nenhum corretor cadastrado ainda",
 * "Nenhum cliente…". A pessoa concluía que os dados tinham sumido, não que a
 * internet tinha caído, e às vezes recadastrava tudo. O erro vem antes do
 * vazio em toda lista, e sempre com a saída.
 */
defineProps<{ what: string }>();
defineEmits<{ retry: [] }>();
</script>

<template>
  <div class="admin-card load-error" role="alert">
    <p>Não foi possível carregar {{ what }}. Verifique a conexão.</p>
    <button type="button" class="admin-btn" @click="$emit('retry')">Tentar de novo</button>
  </div>
</template>

<style scoped>
.load-error {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
}
.load-error p {
  margin: 0;
  color: var(--ink-soft);
}
</style>
