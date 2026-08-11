<script setup lang="ts">
import type { Property } from '~~/shared/models/property'
import { PROPERTY_TYPE_LABELS, PROPERTY_STATUS_LABELS } from '~~/shared/models/property'

definePageMeta({ layout: 'admin', middleware: 'admin' })

const { data: properties, refresh, pending } = await useAsyncData(
  'admin:properties:list',
  () => adminFetch<Property[]>('/api/admin/properties'),
  { server: false, default: () => [] as Property[] },
)

const deleting = ref<string | null>(null)

async function remove(p: Property) {
  if (!confirm(`Excluir o imóvel ${p.code}? Esta ação não pode ser desfeita.`)) return
  deleting.value = p.id
  try {
    await adminFetch(`/api/admin/properties/${p.id}`, { method: 'DELETE' })
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
    <div class="page-head">
      <h1>Imóveis</h1>
      <NuxtLink class="admin-btn" to="/admin/imoveis/novo">+ Novo imóvel</NuxtLink>
    </div>

    <p v-if="pending" class="admin-card muted-block">Carregando...</p>
    <p v-else-if="!properties?.length" class="admin-card muted-block">
      Nenhum imóvel cadastrado ainda. Clique em “Novo imóvel”.
    </p>

    <template v-else>
      <!-- Mobile: cards -->
      <div class="cards">
        <article v-for="p in properties" :key="p.id" class="admin-card row-card">
          <div class="row-thumb">
            <img v-if="p.images[0]" :src="p.images[0].url" :alt="p.title" loading="lazy" />
            <AppIcon v-else name="home" />
          </div>
          <div class="row-info">
            <div class="row-top">
              <span class="mono">{{ p.code }}</span>
              <span class="pill" :class="{ muted: p.status !== 'active' }">
                {{ PROPERTY_STATUS_LABELS[p.status] }}
              </span>
            </div>
            <strong class="row-title">{{ p.title }}</strong>
            <div class="row-meta">
              {{ PROPERTY_TYPE_LABELS[p.type] }} · {{ p.purpose === 'aluguel' ? 'Aluguel' : 'Venda' }}
              · <b>{{ formatBRL(p.price) }}</b>
            </div>
            <div class="row-actions">
              <NuxtLink class="admin-btn ghost sm" :to="`/admin/imoveis/${p.id}`">Editar</NuxtLink>
              <button class="admin-btn danger sm" :disabled="deleting === p.id" @click="remove(p)">
                {{ deleting === p.id ? '...' : 'Excluir' }}
              </button>
            </div>
          </div>
        </article>
      </div>

      <!-- Desktop: tabela -->
      <div class="admin-card table-wrap">
        <table class="admin-table">
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
              <td class="mono">{{ p.code }}</td>
              <td>{{ p.title }}</td>
              <td>{{ PROPERTY_TYPE_LABELS[p.type] }}</td>
              <td>{{ p.purpose === 'aluguel' ? 'Aluguel' : 'Venda' }}</td>
              <td>{{ formatBRL(p.price) }}</td>
              <td>
                <span class="pill" :class="{ muted: p.status !== 'active' }">
                  {{ PROPERTY_STATUS_LABELS[p.status] }}
                </span>
              </td>
              <td class="td-actions">
                <NuxtLink class="admin-btn ghost sm" :to="`/admin/imoveis/${p.id}`">Editar</NuxtLink>
                <button class="admin-btn danger sm" :disabled="deleting === p.id" @click="remove(p)">
                  {{ deleting === p.id ? '...' : 'Excluir' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>

<style scoped>
.page-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.muted-block {
  color: var(--ink-soft);
}
.mono {
  font-family: 'Space Grotesk', sans-serif;
  font-weight: 600;
  letter-spacing: 0.02em;
}
.admin-btn.sm {
  padding: 8px 12px;
  font-size: 13px;
}

/* ---- Cards (mobile) ---- */
.cards {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.row-card {
  display: flex;
  gap: 13px;
  padding: 12px;
  align-items: stretch;
}
.row-thumb {
  width: 84px;
  min-width: 84px;
  border-radius: 10px;
  overflow: hidden;
  background: var(--brand);
  color: #fff;
  display: grid;
  place-items: center;
}
.row-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.row-thumb :deep(svg) {
  width: 26px;
  height: 26px;
}
.row-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.row-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.row-title {
  font-size: 15px;
  line-height: 1.25;
}
.row-meta {
  font-size: 13px;
  color: var(--ink-soft);
}
.row-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
.row-actions .admin-btn {
  flex: 1;
  text-align: center;
}

/* ---- Tabela (desktop) ---- */
.table-wrap {
  display: none;
  overflow-x: auto;
}
.td-actions {
  white-space: nowrap;
  text-align: right;
}
.td-actions .admin-btn + .admin-btn {
  margin-left: 6px;
}

@media (min-width: 760px) {
  .cards {
    display: none;
  }
  .table-wrap {
    display: block;
  }
}
</style>
