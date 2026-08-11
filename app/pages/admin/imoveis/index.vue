<script setup lang="ts">
import type { Property } from '~~/shared/models/property'
import { PROPERTY_TYPE_LABELS, PROPERTY_STATUS_LABELS } from '~~/shared/models/property'

definePageMeta({ layout: 'admin', middleware: 'admin' })

const { data: properties, refresh, pending } = await useAsyncData(
  'admin:properties:list',
  () => $fetch<Property[]>('/api/admin/properties'),
  { server: false, default: () => [] as Property[] },
)

const deleting = ref<string | null>(null)

async function remove(p: Property) {
  if (!confirm(`Excluir o imóvel ${p.code}? Esta ação não pode ser desfeita.`)) return
  deleting.value = p.id
  try {
    await $fetch(`/api/admin/properties/${p.id}`, { method: 'DELETE' })
    await refresh()
  } catch {
    alert('Não foi possível excluir.')
  } finally {
    deleting.value = null
  }
}

useHead({ title: 'Imóveis · Painel' })
</script>

<template>
  <div>
    <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap">
      <h1>Imóveis</h1>
      <NuxtLink class="admin-btn" to="/admin/imoveis/novo">+ Novo imóvel</NuxtLink>
    </div>

    <div class="admin-card" style="margin-top: 16px; overflow-x: auto">
      <p v-if="pending" style="color: var(--ink-soft)">Carregando...</p>
      <p v-else-if="!properties?.length" style="color: var(--ink-soft)">
        Nenhum imóvel cadastrado ainda. Clique em “Novo imóvel”.
      </p>
      <table v-else class="admin-table">
        <thead>
          <tr>
            <th>Código</th>
            <th>Título</th>
            <th>Tipo</th>
            <th>Pretensão</th>
            <th>Preço</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in properties" :key="p.id">
            <td>{{ p.code }}</td>
            <td>{{ p.title }}</td>
            <td>{{ PROPERTY_TYPE_LABELS[p.type] }}</td>
            <td>{{ p.purpose === 'aluguel' ? 'Aluguel' : 'Venda' }}</td>
            <td>{{ formatBRL(p.price) }}</td>
            <td>
              <span class="pill" :class="{ muted: p.status !== 'active' }">
                {{ PROPERTY_STATUS_LABELS[p.status] }}
              </span>
            </td>
            <td style="white-space: nowrap; text-align: right">
              <NuxtLink class="admin-btn ghost" :to="`/admin/imoveis/${p.id}`" style="padding: 7px 12px">Editar</NuxtLink>
              <button
                class="admin-btn danger"
                style="padding: 7px 12px; margin-left: 6px"
                :disabled="deleting === p.id"
                @click="remove(p)"
              >
                {{ deleting === p.id ? '...' : 'Excluir' }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
