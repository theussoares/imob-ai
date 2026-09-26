<script setup lang="ts">
import type { Broker, BrokerInput } from '~~/shared/models/broker'

definePageMeta({ layout: 'admin', middleware: 'admin' })

const toast = useToast()
const { askConfirm } = useConfirm()

// Lazy (sem `await`): abre a tela na hora e mostra "Carregando" em vez de segurar
// a navegação até a requisição terminar.
const { data: brokers, refresh, pending, error: loadError } = useLazyAsyncData(
  'admin:brokers',
  () => adminFetch<Broker[]>('/api/admin/brokers'),
  { server: false, default: () => [] as Broker[] },
)

const empty = (): BrokerInput => ({
  name: '',
  phone: '',
  email: '',
  creci: '',
  active: true,
  photoUrl: '',
  bio: '',
  publicVisible: false,
})
const form = reactive<BrokerInput>(empty())
const editingId = ref<string | null>(null)
const saving = ref(false)
const error = ref('')
const formEl = ref<HTMLElement | null>(null)

// Campo exibe +55 (67) 99123-4567; o model guarda os dígitos com DDI.
const { display: phoneDisplay, onInput: onPhoneInput, isValid: phoneValid } =
  usePhoneInput(toRef(form, 'phone'), 'whatsapp')

const { uploading: uploadingPhoto, onFile: onPhotoFile } = useBrandUpload({
  bucket: 'tenant-hero',
  prefix: 'broker',
  maxEdge: 480, // retrato pequeno na vitrine — não precisa da resolução do hero
  onDone: (url) => (form.photoUrl = url),
})

function edit(b: Broker) {
  editingId.value = b.id
  Object.assign(form, {
    name: b.name,
    phone: b.phone || '',
    email: b.email || '',
    creci: b.creci || '',
    active: b.active,
    photoUrl: b.photoUrl || '',
    bio: b.bio || '',
    publicVisible: b.publicVisible,
  })
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
  const ok = await askConfirm({
    title: `Excluir o corretor ${b.name}?`,
    description: 'Os contatos atribuídos a ele ficam sem responsável.',
    confirmLabel: 'Excluir',
    danger: true,
  })
  if (!ok) return
  try {
    await adminFetch(`/api/admin/brokers/${b.id}`, { method: 'DELETE' })
    if (editingId.value === b.id) cancel()
    await refresh()
    toast.success('Corretor excluído.')
  } catch {
    toast.error('Não foi possível excluir o corretor.')
  }
}

// ---- Roleta de leads (0049) ----
const { data: crm, refresh: refreshCrm } = useLazyAsyncData(
  'admin:crm-settings',
  () => adminFetch<{ leadDistribution: 'manual' | 'roleta' }>('/api/admin/crm-settings'),
  { server: false, default: () => ({ leadDistribution: 'manual' as const }) },
)
const salvandoModo = ref(false)
async function setModo(modo: 'manual' | 'roleta') {
  if (crm.value?.leadDistribution === modo) return
  salvandoModo.value = true
  try {
    crm.value = await adminFetch('/api/admin/crm-settings', { method: 'PUT', body: { leadDistribution: modo } })
    toast.success(modo === 'roleta' ? 'Roleta ligada.' : 'Distribuição manual.')
  } catch {
    await refreshCrm()
    toast.error('Não foi possível mudar a distribuição.')
  } finally {
    salvandoModo.value = false
  }
}

const ativos = computed(() => (brokers.value ?? []).filter((b) => b.active))
const naRoleta = computed(() => ativos.value.filter((b) => b.receivesLeads))
/**
 * Quem recebe o próximo: a mesma regra da função no banco — quem recebeu há
 * mais tempo (ou nunca) primeiro. É só a previsão da tela; quem decide é o
 * banco, na hora em que o lead chega.
 */
const proximo = computed(() =>
  [...naRoleta.value].sort((a, b) => {
    if (!a.lastLeadAt !== !b.lastLeadAt) return a.lastLeadAt ? 1 : -1
    return (a.lastLeadAt ?? '').localeCompare(b.lastLeadAt ?? '')
  })[0] ?? null,
)
const togglando = ref<string | null>(null)
async function toggleRoleta(b: Broker) {
  togglando.value = b.id
  try {
    const body: BrokerInput = {
      name: b.name,
      phone: b.phone,
      email: b.email,
      creci: b.creci,
      active: b.active,
      photoUrl: b.photoUrl,
      bio: b.bio,
      publicVisible: b.publicVisible,
      receivesLeads: !b.receivesLeads,
    }
    await adminFetch(`/api/admin/brokers/${b.id}`, { method: 'PUT', body })
    await refresh()
  } catch {
    toast.error('Não foi possível atualizar a roleta.')
  } finally {
    togglando.value = null
  }
}
function ultimoLead(iso: string | null) {
  if (!iso) return 'ainda não recebeu'
  return 'último em ' + new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) +
    ' às ' + new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
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

    <section class="admin-card roleta" aria-labelledby="roleta-t">
      <header class="roleta-head">
        <AppIcon name="roleta" class="roleta-ico" />
        <div>
          <h2 id="roleta-t" class="section-t">Distribuição dos contatos do site</h2>
          <p class="hint-text">Quem atende o contato que chega pelo formulário.</p>
        </div>
      </header>

      <div class="modos" role="radiogroup" aria-labelledby="roleta-t">
        <button
          type="button"
          role="radio"
          class="modo"
          :aria-checked="crm?.leadDistribution === 'manual'"
          :disabled="salvandoModo"
          @click="setModo('manual')"
        >
          <strong>Manual</strong>
          <span>O contato chega sem responsável e alguém do painel escolhe o corretor.</span>
        </button>
        <button
          type="button"
          role="radio"
          class="modo"
          :aria-checked="crm?.leadDistribution === 'roleta'"
          :disabled="salvandoModo"
          @click="setModo('roleta')"
        >
          <strong>Roleta</strong>
          <span>Cada contato novo vai para o próximo corretor da fila, em rodízio. Ele recebe o aviso por e-mail.</span>
        </button>
      </div>

      <template v-if="crm?.leadDistribution === 'roleta'">
        <p v-if="!naRoleta.length" class="roleta-alerta" role="status">
          <AppIcon name="alert" /> Ninguém está na roleta ainda: os contatos continuam chegando sem responsável.
          Marque abaixo quem participa.
        </p>
        <p v-else-if="proximo" class="roleta-proximo">
          Próximo da vez: <strong>{{ proximo.name }}</strong>
        </p>
        <ul v-if="ativos.length" class="fila">
          <li v-for="b in ativos" :key="b.id" class="fila-item">
            <label class="switch">
              <input
                type="checkbox"
                role="switch"
                :checked="b.receivesLeads"
                :disabled="togglando === b.id"
                @change="toggleRoleta(b)"
              />
              <span class="switch-ui" aria-hidden="true" />
              <span class="fila-nome">{{ b.name }}</span>
            </label>
            <span class="fila-meta">
              <template v-if="b.receivesLeads">{{ ultimoLead(b.lastLeadAt) }}</template>
              <template v-else>fora da roleta</template>
              <template v-if="b.receivesLeads && !b.email"> · sem e-mail, não recebe o aviso</template>
            </span>
          </li>
        </ul>
        <p v-else class="hint-text">Cadastre um corretor ativo abaixo para usar a roleta.</p>
      </template>
    </section>

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
            placeholder="+55 (67) 99123-4567"
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

        <div class="broker-public" style="grid-column: 1 / -1">
          <h4 class="section-t sub">
            Vitrine pública <span class="section-hint">(carrossel de corretores em "Quem somos")</span>
          </h4>
          <label class="check">
            <input v-model="form.publicVisible" type="checkbox" /> Mostrar este corretor no site
          </label>
          <p class="hint-text">
            Sem isto marcado, o corretor continua só no seu painel — nunca aparece pra quem visita o site, mesmo com
            foto e minibio preenchidas.
          </p>

          <div class="form-grid" style="margin-top: 10px">
            <div>
              <label class="admin-label">Foto</label>
              <div class="logo-row">
                <div class="broker-photo-preview">
                  <img v-if="form.photoUrl" :src="supabaseRenderImage(form.photoUrl, { width: 120, height: 120, quality: 75 })" alt="" />
                  <AppIcon v-else name="home" />
                </div>
                <label class="admin-btn ghost file-btn">
                  {{ uploadingPhoto ? 'Enviando...' : 'Enviar foto' }}
                  <input type="file" accept="image/*" hidden @change="onPhotoFile" />
                </label>
                <button v-if="form.photoUrl" type="button" class="admin-btn ghost" @click="form.photoUrl = ''">
                  Remover
                </button>
              </div>
            </div>
            <div>
              <label class="admin-label">Minibio</label>
              <textarea v-model="form.bio" class="admin-textarea" rows="3" maxlength="500" placeholder="Uma ou duas frases sobre a experiência dele." />
            </div>
          </div>
        </div>

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
      <AdminLoadError v-else-if="loadError" what="os corretores" @retry="refresh()" />
      <p v-else-if="!brokers?.length" style="color: var(--ink-soft)">Nenhum corretor cadastrado ainda.</p>
      <ul v-else class="broker-list">
        <li v-for="b in brokers" :key="b.id" class="broker">
          <div class="broker-photo-preview list-thumb">
            <img v-if="b.photoUrl" :src="supabaseRenderImage(b.photoUrl, { width: 80, height: 80, quality: 70 })" alt="" />
            <AppIcon v-else name="home" />
          </div>
          <div class="broker-info">
            <strong>{{ b.name }}</strong>
            <span v-if="!b.active" class="pill muted">Inativo</span>
            <span v-if="b.publicVisible" class="pill">No site</span>
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
            <button class="admin-btn danger-ghost sm" @click="remove(b)">Excluir</button>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
/* Roleta */
.roleta {
  margin-bottom: 18px;
}
.roleta-head {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 14px;
}
.roleta-head .section-t {
  margin: 0 0 2px;
}
.roleta-head .hint-text {
  margin: 0;
}
.roleta-ico {
  flex: none;
  width: 22px;
  height: 22px;
  margin-top: 2px;
  color: var(--brand);
}
.modos {
  display: grid;
  gap: 10px;
}
@media (min-width: 640px) {
  .modos {
    grid-template-columns: 1fr 1fr;
  }
}
.modo {
  display: flex;
  flex-direction: column;
  gap: 4px;
  text-align: left;
  padding: 12px 14px;
  border: 1.5px solid var(--line-2);
  border-radius: var(--r-md);
  background: var(--paper);
  color: var(--ink);
  font: inherit;
  cursor: pointer;
  transition: border-color 0.15s ease-out, background-color 0.15s ease-out;
}
.modo span {
  font-size: var(--fs-label);
  color: var(--ink-soft);
  line-height: 1.45;
}
.modo:hover {
  border-color: color-mix(in srgb, var(--brand) 40%, var(--line-2));
}
.modo[aria-checked='true'] {
  border-color: var(--brand);
  background: var(--brand-ghost);
}
.modo[aria-checked='true'] strong {
  color: var(--brand);
}
.modo:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}
.roleta-alerta {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  margin: 14px 0 0;
  padding: 10px 12px;
  border-radius: var(--r-md);
  background: #fffbeb;
  color: #7a5200;
  font-size: var(--fs-label);
}
.roleta-alerta :deep(svg) {
  flex: none;
  width: 16px;
  height: 16px;
  margin-top: 1px;
}
.roleta-proximo {
  margin: 14px 0 0;
  font-size: var(--fs-ui);
}
.fila {
  list-style: none;
  margin: 10px 0 0;
  padding: 0;
  border-top: 1px solid var(--line);
}
.fila-item {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 4px 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--line);
}
.fila-meta {
  font-size: var(--fs-label);
  color: var(--ink-soft);
  font-variant-numeric: tabular-nums;
}
.switch {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  font-weight: 600;
  font-size: var(--fs-ui);
}
.switch input {
  position: absolute;
  opacity: 0;
  width: 1px;
  height: 1px;
}
.switch-ui {
  position: relative;
  flex: none;
  width: 36px;
  height: 20px;
  border-radius: 999px;
  background: var(--line-2);
  transition: background-color 0.15s ease-out;
}
.switch-ui::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 2px rgba(20, 22, 26, 0.25);
  transition: transform 0.15s ease-out;
}
.switch input:checked + .switch-ui {
  background: var(--brand);
}
.switch input:checked + .switch-ui::after {
  transform: translateX(16px);
}
.switch input:focus-visible + .switch-ui {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}
.switch input:disabled + .switch-ui {
  opacity: 0.5;
}
@media (prefers-reduced-motion: reduce) {
  .switch-ui,
  .switch-ui::after,
  .modo {
    transition: none;
  }
}

.section-t {
  font-family: var(--font-display);
  font-size: var(--fs-body);
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
  font-size: var(--fs-ui);
}
.form-actions {
  display: flex;
  gap: 10px;
  align-items: center;
}
.broker-public {
  border-top: 1px dashed var(--line-2);
  padding-top: 14px;
  margin-top: 4px;
}
.section-t.sub {
  border-top: none;
  padding-top: 0;
  margin: 0 0 8px;
  font-size: var(--fs-label);
}
.hint-text {
  font-size: var(--fs-caption);
  color: var(--ink-soft);
  margin: 6px 0 0;
}
.logo-row {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}
.file-btn {
  cursor: pointer;
}
.broker-photo-preview {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: var(--surface);
  border: 1.5px solid var(--line-2);
  color: var(--ink-soft);
  display: grid;
  place-items: center;
  overflow: hidden;
  flex: none;
}
.broker-photo-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.broker-photo-preview :deep(svg) {
  width: 24px;
  height: 24px;
}
.broker-photo-preview.list-thumb {
  width: 44px;
  height: 44px;
}
.err {
  color: #b91c1c;
  font-size: var(--fs-label);
  margin: 0;
  grid-column: 1 / -1;
}
.field-err {
  color: #b91c1c;
  font-size: var(--fs-caption);
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
.broker-info {
  flex: 1;
  min-width: 160px;
}
.broker-info strong {
  font-size: var(--fs-body);
}
.broker-meta {
  color: var(--ink-soft);
  font-size: var(--fs-label);
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
  font-size: var(--fs-label);
}
.btn-wa.sm {
  flex: none;
}
</style>
