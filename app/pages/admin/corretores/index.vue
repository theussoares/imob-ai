<script setup lang="ts">
import type { Broker, BrokerInput } from '~~/shared/models/broker'

definePageMeta({ layout: 'admin', middleware: 'admin' })

const toast = useToast()
const { askConfirm } = useConfirm()

// Lazy (sem `await`): abre a tela na hora e mostra "Carregando" em vez de segurar
// a navegação até a requisição terminar.
const { data: brokers, refresh, pending } = useLazyAsyncData(
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
.broker-public {
  border-top: 1px dashed var(--line-2);
  padding-top: 14px;
  margin-top: 4px;
}
.section-t.sub {
  border-top: none;
  padding-top: 0;
  margin: 0 0 8px;
  font-size: 13.5px;
}
.hint-text {
  font-size: 12.5px;
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
.broker-info {
  flex: 1;
  min-width: 160px;
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
