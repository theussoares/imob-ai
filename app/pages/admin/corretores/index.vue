<script setup lang="ts">
import type { Broker, BrokerInput } from '~~/shared/models/broker'

definePageMeta({ layout: 'admin', middleware: 'admin' })

// Lazy (sem `await`): abre a tela na hora e mostra "Carregando" em vez de segurar
// a navegação até a requisição terminar.
const { data: brokers, refresh, pending } = useLazyAsyncData(
  'admin:brokers',
  () => adminFetch<Broker[]>('/api/admin/brokers'),
  { server: false, default: () => [] as Broker[] },
)

const empty = (): BrokerInput => ({ name: '', phone: '', email: '', creci: '', active: true })
const form = reactive<BrokerInput>(empty())
const editingId = ref<string | null>(null)
const saving = ref(false)
const error = ref('')
const formEl = ref<HTMLElement | null>(null)

// Campo exibe +55 (67) 99217-1768; o model guarda os dígitos com DDI.
const { display: phoneDisplay, onInput: onPhoneInput, isValid: phoneValid } =
  usePhoneInput(toRef(form, 'phone'), 'whatsapp')

function edit(b: Broker) {
  editingId.value = b.id
  Object.assign(form, { name: b.name, phone: b.phone || '', email: b.email || '', creci: b.creci || '', active: b.active })
  formEl.value?.scrollIntoView({ behavior: 'smooth' })
}
function cancel() {
  editingId.value = null
  Object.assign(form, empty())
}

async function save() {
  if (!form.name.trim()) {
    error.value = 'Informe o nome do corretor.'
    return
  }
  if (!phoneValid.value) {
    error.value = 'WhatsApp/telefone inválido (com DDD).'
    return
  }
  saving.value = true
  error.value = ''
  try {
    if (editingId.value) {
      await adminFetch(`/api/admin/brokers/${editingId.value}`, { method: 'PUT', body: form })
    } else {
      await adminFetch('/api/admin/brokers', { method: 'POST', body: form })
    }
    cancel()
    await refresh()
  } catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string } }
    error.value = err?.data?.statusMessage || 'Não foi possível salvar.'
  } finally {
    saving.value = false
  }
}

async function remove(b: Broker) {
  if (!confirm(`Excluir o corretor ${b.name}?`)) return
  try {
    await adminFetch(`/api/admin/brokers/${b.id}`, { method: 'DELETE' })
    if (editingId.value === b.id) cancel()
    await refresh()
  } catch {
    alert('Não foi possível excluir.')
  }
}

function waLink(b: Broker) {
  const d = (b.phone || '').replace(/\D/g, '')
  return d ? `https://wa.me/${d}` : ''
}

useHead({ title: 'Corretores · Painel' })
</script>

<template>
  <div>
    <h1>Corretores</h1>
    <p style="color: var(--ink-soft); margin-bottom: 16px">
      Cadastre os corretores da equipe. Depois você poderá vincular quem captou cada imóvel.
    </p>

    <div ref="formEl" class="admin-card" style="margin-bottom: 18px">
      <h3 class="section-t">{{ editingId ? 'Editar corretor' : 'Novo corretor' }}</h3>
      <form class="form-grid" @submit.prevent="save">
        <div>
          <label class="admin-label">Nome *</label>
          <input v-model="form.name" class="admin-input" required />
        </div>
        <div>
          <label class="admin-label">WhatsApp / telefone</label>
          <input
            :value="phoneDisplay"
            class="admin-input"
            type="tel"
            inputmode="numeric"
            placeholder="+55 (67) 99217-1768"
            @input="onPhoneInput"
          />
          <p v-if="!phoneValid" class="field-err">Número inválido (com DDD).</p>
        </div>
        <div>
          <label class="admin-label">E-mail</label>
          <input v-model="form.email" class="admin-input" type="email" />
        </div>
        <div>
          <label class="admin-label">CRECI</label>
          <input v-model="form.creci" class="admin-input" />
        </div>
        <label class="check">
          <input v-model="form.active" type="checkbox" /> Ativo
        </label>
        <div class="form-actions">
          <button class="admin-btn" type="submit" :disabled="saving">
            {{ saving ? 'Salvando...' : editingId ? 'Salvar alterações' : 'Adicionar corretor' }}
          </button>
          <button v-if="editingId" type="button" class="admin-btn ghost" @click="cancel">Cancelar</button>
        </div>
        <p v-if="error" class="err">{{ error }}</p>
      </form>
    </div>

    <div class="admin-card">
      <p v-if="pending" style="color: var(--ink-soft)">Carregando...</p>
      <p v-else-if="!brokers?.length" style="color: var(--ink-soft)">Nenhum corretor cadastrado ainda.</p>
      <ul v-else class="broker-list">
        <li v-for="b in brokers" :key="b.id" class="broker">
          <div class="broker-info">
            <strong>{{ b.name }}</strong>
            <span v-if="!b.active" class="pill muted">Inativo</span>
            <div class="broker-meta">
              <template v-if="b.creci">CRECI {{ b.creci }}</template>
              <template v-if="b.phone"> · {{ b.phone }}</template>
              <template v-if="b.email"> · {{ b.email }}</template>
            </div>
          </div>
          <div class="broker-actions">
            <a v-if="waLink(b)" class="btn-wa sm" :href="waLink(b)" target="_blank" rel="noopener">
              <AppIcon name="wa" /> WhatsApp
            </a>
            <button class="admin-btn ghost sm" @click="edit(b)">Editar</button>
            <button class="admin-btn danger sm" @click="remove(b)">Excluir</button>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.section-t {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 15px;
  margin: 0 0 14px;
}
.form-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 14px;
}
@media (min-width: 560px) {
  .form-grid {
    grid-template-columns: 1fr 1fr;
  }
}
.check {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 14px;
}
.form-actions {
  display: flex;
  gap: 10px;
  align-items: center;
}
.err {
  color: #b91c1c;
  font-size: 13px;
  margin: 0;
  grid-column: 1 / -1;
}
.field-err {
  color: #b91c1c;
  font-size: 12.5px;
  margin: 4px 0 0;
}
.broker-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}
.broker {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 13px 2px;
  border-bottom: 1px solid var(--line);
}
.broker:last-child {
  border-bottom: none;
}
.broker-info strong {
  font-size: 15px;
}
.broker-meta {
  color: var(--ink-soft);
  font-size: 13px;
  margin-top: 2px;
}
.broker-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.admin-btn.sm,
.btn-wa.sm {
  padding: 8px 12px;
  font-size: 13px;
}
.btn-wa.sm {
  flex: none;
}
</style>
