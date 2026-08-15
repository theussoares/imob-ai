<script setup lang="ts">
import type { Property } from '~~/shared/models/property'

definePageMeta({ layout: 'admin', middleware: 'admin' })

// Lazy (sem `await`): abre a tela na hora e mostra "Carregando" em vez de segurar
// a navegação até a requisição terminar.
const { data: properties, pending } = useLazyAsyncData(
  'admin:properties',
  () => adminFetch<Property[]>('/api/admin/properties'),
  { server: false, default: () => [] as Property[] },
)

const stats = computed(() => {
  const list = properties.value ?? []
  return {
    total: list.length,
    active: list.filter((p) => p.status === 'active').length,
    venda: list.filter((p) => p.purpose === 'venda').length,
    aluguel: list.filter((p) => p.purpose === 'aluguel').length,
  }
})

useHead({ title: 'Dashboard · Painel' })
</script>

<template>
  <div>
    <h1>Dashboard</h1>
    <p style="color: var(--ink-soft); margin-bottom: 20px">Visão geral do seu catálogo.</p>

    <div v-if="pending" style="color: var(--ink-soft)">Carregando...</div>

    <div v-else class="stat-grid">
      <div class="admin-card stat"><span>{{ stats.total }}</span><small>Imóveis cadastrados</small></div>
      <div class="admin-card stat"><span>{{ stats.active }}</span><small>Publicados</small></div>
      <div class="admin-card stat"><span>{{ stats.venda }}</span><small>À venda</small></div>
      <div class="admin-card stat"><span>{{ stats.aluguel }}</span><small>Para alugar</small></div>
    </div>

    <div style="margin-top: 22px; display: flex; gap: 10px; flex-wrap: wrap">
      <NuxtLink class="admin-btn" to="/admin/imoveis/novo">+ Novo imóvel</NuxtLink>
      <NuxtLink class="admin-btn ghost" to="/admin/imoveis">Gerenciar imóveis</NuxtLink>
      <NuxtLink class="admin-btn ghost" to="/admin/config">Configurações</NuxtLink>
    </div>
  </div>
</template>

<style scoped>
.stat-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px;
}
.stat {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.stat span {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 34px;
  font-weight: 700;
  color: var(--brand);
}
.stat small {
  color: var(--ink-soft);
  font-size: 13px;
}
@media (min-width: 720px) {
  .stat-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}
</style>
