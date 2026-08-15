<script setup lang="ts">
import type { Lead } from '~~/shared/models/lead'

definePageMeta({ layout: 'admin', middleware: 'admin' })

const { data: leads, pending } = await useAsyncData(
  'admin:leads',
  () => adminFetch<Lead[]>('/api/admin/leads'),
  { server: false, default: () => [] as Lead[] },
)

const search = ref('')

const filtered = computed(() => {
  const term = search.value.trim().toLowerCase()
  const list = leads.value ?? []
  if (!term) return list
  return list.filter((l) =>
    `${l.name ?? ''} ${l.phone ?? ''} ${l.message ?? ''} ${l.property?.code ?? ''} ${l.property?.title ?? ''}`
      .toLowerCase()
      .includes(term),
  )
})

function waHref(phone?: string | null) {
  const d = (phone || '').replace(/\D/g, '')
  return d ? `https://wa.me/${d}` : ''
}

/** "há 2 horas", "ontem", "12/08" — mais útil que timestamp cru numa lista de contatos. */
function whenLabel(iso: string) {
  const then = new Date(iso)
  const diffMin = Math.round((Date.now() - then.getTime()) / 60000)
  if (diffMin < 1) return 'agora'
  if (diffMin < 60) return `há ${diffMin} min`
  const diffH = Math.round(diffMin / 60)
  if (diffH < 24) return `há ${diffH} h`
  const diffD = Math.round(diffH / 24)
  if (diffD === 1) return 'ontem'
  if (diffD < 7) return `há ${diffD} dias`
  return then.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function fullDate(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

useHead({ title: 'Contatos · Painel' })
</script>

<template>
  <div>
    <div class="page-head">
      <div>
        <h1>Contatos</h1>
        <p class="sub">
          Pessoas que preencheram o formulário no site. O contato mais recente aparece primeiro.
        </p>
      </div>
    </div>

    <div v-if="leads?.length" class="admin-card search-row">
      <div class="search-field">
        <label class="admin-label" for="lq">Buscar</label>
        <input
          id="lq"
          v-model="search"
          class="admin-input"
          type="search"
          placeholder="Nome, telefone, mensagem ou imóvel..."
          autocomplete="off"
        />
      </div>
      <span class="count">{{ filtered.length }} de {{ leads.length }} contatos</span>
    </div>

    <p v-if="pending" class="admin-card muted-block">Carregando...</p>
    <p v-else-if="!leads?.length" class="admin-card muted-block">
      Nenhum contato recebido ainda. Quando alguém preencher o formulário num imóvel do site,
      o contato aparece aqui.
    </p>
    <p v-else-if="!filtered.length" class="admin-card muted-block">
      Nenhum contato encontrado com essa busca.
    </p>

    <div v-else class="lead-list">
      <article v-for="l in filtered" :key="l.id" class="admin-card lead">
        <div class="lead-head">
          <strong class="lead-name">{{ l.name || 'Sem nome' }}</strong>
          <time class="lead-when" :title="fullDate(l.createdAt)">{{ whenLabel(l.createdAt) }}</time>
        </div>

        <p v-if="l.message" class="lead-msg">{{ l.message }}</p>

        <div class="lead-meta">
          <NuxtLink v-if="l.property" class="lead-prop" :to="`/imovel/${l.property.code}`" target="_blank">
            🏠 {{ l.property.code }} · {{ l.property.title }}
          </NuxtLink>
          <span v-else class="lead-prop muted">Contato geral (não veio de um imóvel)</span>
        </div>

        <div class="lead-actions">
          <a
            v-if="waHref(l.phone)"
            class="admin-btn sm"
            :href="waHref(l.phone)"
            target="_blank"
            rel="noopener"
          >
            <AppIcon name="wa" /> Responder no WhatsApp
          </a>
          <a v-if="l.phone" class="admin-btn ghost sm" :href="`tel:${l.phone}`">{{ l.phone }}</a>
          <span v-else class="muted">Sem telefone</span>
        </div>
      </article>
    </div>
  </div>
</template>

<style scoped>
.page-head {
  margin-bottom: 16px;
}
.sub {
  color: var(--ink-soft);
  margin: 4px 0 0;
  font-size: 14px;
}
.muted-block {
  color: var(--ink-soft);
}
.muted {
  color: var(--ink-soft);
  font-size: 13px;
}
.search-row {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.search-field {
  flex: 1;
  min-width: 220px;
}
.count {
  font-size: 13px;
  color: var(--ink-soft);
  white-space: nowrap;
}
.lead-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.lead {
  padding: 16px;
}
.lead-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}
.lead-name {
  font-size: 16px;
}
.lead-when {
  font-size: 12.5px;
  color: var(--ink-soft);
  white-space: nowrap;
}
.lead-msg {
  margin: 8px 0 0;
  font-size: 14.5px;
  line-height: 1.55;
  white-space: pre-wrap;
}
.lead-meta {
  margin-top: 10px;
  font-size: 13px;
}
.lead-prop {
  color: var(--brand);
  font-weight: 600;
  text-decoration: none;
}
.lead-prop:hover {
  text-decoration: underline;
}
.lead-prop.muted {
  color: var(--ink-soft);
  font-weight: 500;
}
.lead-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--line);
  flex-wrap: wrap;
}
.admin-btn.sm {
  padding: 8px 12px;
  font-size: 13px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
}
.admin-btn.sm :deep(svg) {
  width: 15px;
  height: 15px;
}
</style>
