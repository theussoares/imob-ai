<script setup lang="ts">
import type { Contract } from '~~/shared/models/portal'

definePageMeta({ layout: 'admin', middleware: ['admin', 'area-cliente'] })

const { data: contratos, pending } = useLazyAsyncData(
  'admin:contracts',
  () => adminFetch<Contract[]>('/api/admin/contracts'),
  { server: false, default: () => [] as Contract[] },
)

function titulo(c: Contract): string {
  return c.addressLabel || `Contrato ${c.code}`
}

function vigencia(c: Contract): string {
  if (!c.startedOn && !c.endsOn) return 'sem vigência informada'
  return `${dataCurta(c.startedOn)} a ${dataCurta(c.endsOn)}`
}

function dataCurta(v: string | null): string {
  if (!v) return '—'
  const [ano, mes, dia] = v.split('-')
  return `${dia}/${mes}/${ano}`
}

useHead({ title: 'Contratos · Painel' })
</script>

<template>
  <div>
    <div class="topo">
      <div>
        <h1 class="admin-h1">Contratos</h1>
        <p class="admin-sub">Locações administradas, com as partes e os documentos.</p>
      </div>
      <NuxtLink to="/admin/contratos/novo" class="admin-btn">Novo contrato</NuxtLink>
    </div>

    <p v-if="pending" class="dica">Carregando…</p>

    <div v-else-if="!contratos.length" class="admin-card">
      <p class="dica">
        Nenhum contrato cadastrado. Cadastre o primeiro para que os clientes
        vinculados a ele possam ver os documentos na Área do Cliente.
      </p>
    </div>

    <ul v-else class="lista">
      <li v-for="c in contratos" :key="c.id">
        <NuxtLink :to="`/admin/contratos/${c.id}`" class="linha">
          <div class="quem">
            <b>{{ titulo(c) }}</b>
            <small>{{ c.code }} · {{ vigencia(c) }}</small>
          </div>
          <div class="fim">
            <span v-if="c.rentAmount" class="valor">{{ formatBRL(c.rentAmount) }}</span>
            <span v-if="c.status === 'encerrado'" class="tag">Encerrado</span>
          </div>
        </NuxtLink>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.topo {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}
.dica {
  font-size: 13px;
  color: #6b7280;
}
.lista {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}
.linha {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 13px 15px;
  text-decoration: none;
  color: inherit;
}
.linha:hover {
  border-color: var(--brand);
}
.quem {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.quem small {
  font-size: 12px;
  color: #6b7280;
}
.fim {
  display: flex;
  align-items: center;
  gap: 10px;
}
.valor {
  font-weight: 600;
  font-size: 14px;
}
.tag {
  font-size: 11px;
  background: #f3f4f6;
  border-radius: 999px;
  padding: 2px 9px;
  color: #4b5563;
}
</style>
