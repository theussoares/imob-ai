<script setup lang="ts">
import type { Tenant, TenantSettingsInput } from '~~/shared/models/tenant'

definePageMeta({ layout: 'admin', middleware: 'admin' })

const tenant = useTenant()

const form = reactive<TenantSettingsInput>({
  name: '',
  tagline: '',
  heroTitle: '',
  heroSubtitle: '',
  whatsapp: '',
  phone: '',
  email: '',
  creci: '',
  city: '',
  state: '',
  brandPrimary: '#0f3d38',
  brandAccent: '#c2410c',
  logoUrl: '',
  instagram: '',
  website: '',
})
const alternateNamesText = ref('')

let inited = false
watchEffect(() => {
  if (tenant.value && !inited) {
    inited = true
    Object.assign(form, {
      name: tenant.value.name,
      tagline: tenant.value.tagline || '',
      heroTitle: tenant.value.heroTitle || '',
      heroSubtitle: tenant.value.heroSubtitle || '',
      whatsapp: tenant.value.whatsapp || '',
      phone: tenant.value.phone || '',
      email: tenant.value.email || '',
      creci: tenant.value.creci || '',
      city: tenant.value.city || '',
      state: tenant.value.state || '',
      brandPrimary: tenant.value.brandPrimary,
      brandAccent: tenant.value.brandAccent,
      logoUrl: tenant.value.logoUrl || '',
      instagram: tenant.value.instagram || '',
      website: tenant.value.website || '',
    })
    alternateNamesText.value = (tenant.value.alternateNames || []).join('\n')
  }
})

// Preview ao vivo das cores
watch(
  () => [form.brandPrimary, form.brandAccent],
  ([b, a]) => {
    if (import.meta.client) {
      document.documentElement.style.setProperty('--brand', b || '#0f3d38')
      document.documentElement.style.setProperty('--accent', a || '#c2410c')
    }
  },
)

const uploadingLogo = ref(false)
async function onLogo(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  uploadingLogo.value = true
  try {
    const client = await getAdminSupabase()
    const ext = file.name.split('.').pop() || 'png'
    const path = `${tenant.value?.slug || 'tenant'}/logo-${Date.now()}.${ext}`
    const { error } = await client.storage.from('tenant-logos').upload(path, file, { upsert: true, cacheControl: '3600' })
    if (error) throw error
    const { data } = client.storage.from('tenant-logos').getPublicUrl(path)
    form.logoUrl = data.publicUrl
  } catch (err: unknown) {
    const m = err as { message?: string }
    alert('Falha no upload do logo: ' + (m?.message || 'erro'))
  } finally {
    uploadingLogo.value = false
    input.value = ''
  }
}

const saving = ref(false)
const saved = ref(false)
const error = ref('')

async function save() {
  saving.value = true
  saved.value = false
  error.value = ''
  form.alternateNames = alternateNamesText.value
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
  try {
    const updated = await adminFetch<Tenant>('/api/admin/tenant', { method: 'PUT', body: form })
    tenant.value = updated
    saved.value = true
  } catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string } }
    error.value = err?.data?.statusMessage || 'Não foi possível salvar.'
  } finally {
    saving.value = false
  }
}

useHead({ title: 'Configurações · Painel' })
</script>

<template>
  <div>
    <h1>Configurações</h1>
    <p style="color: var(--ink-soft); margin-bottom: 18px">
      Tudo aqui reflete automaticamente no site público.
    </p>

    <form class="admin-card" @submit.prevent="save">
      <h3 class="section-t">Identidade</h3>
      <div class="form-grid">
        <div>
          <label class="admin-label">Nome da imobiliária / corretor</label>
          <input v-model="form.name" class="admin-input" />
        </div>
        <div>
          <label class="admin-label">Tagline (subtítulo do topo)</label>
          <input v-model="form.tagline" class="admin-input" />
        </div>
        <div>
          <label class="admin-label">CRECI</label>
          <input v-model="form.creci" class="admin-input" />
        </div>
      </div>

      <h3 class="section-t">Cores da marca</h3>
      <div class="form-grid">
        <div>
          <label class="admin-label">Cor principal</label>
          <div class="color-row">
            <input v-model="form.brandPrimary" type="color" class="color-swatch" />
            <input v-model="form.brandPrimary" class="admin-input" />
          </div>
        </div>
        <div>
          <label class="admin-label">Cor de destaque (locação)</label>
          <div class="color-row">
            <input v-model="form.brandAccent" type="color" class="color-swatch" />
            <input v-model="form.brandAccent" class="admin-input" />
          </div>
        </div>
        <div class="preview-box">
          <span class="badge">Venda</span>
          <span class="badge rent">Aluguel</span>
          <span class="admin-btn" style="pointer-events: none">Botão</span>
        </div>
      </div>

      <h3 class="section-t">Logo</h3>
      <div class="logo-row">
        <div class="logo-preview">
          <img v-if="form.logoUrl" :src="form.logoUrl" alt="Logo" />
          <AppIcon v-else name="home" />
        </div>
        <label class="admin-btn ghost file-btn">
          {{ uploadingLogo ? 'Enviando...' : 'Enviar logo' }}
          <input type="file" accept="image/*" hidden @change="onLogo" />
        </label>
        <button v-if="form.logoUrl" type="button" class="admin-btn ghost" @click="form.logoUrl = ''">Remover</button>
      </div>

      <h3 class="section-t">Textos da home</h3>
      <div>
        <label class="admin-label">Título principal (hero)</label>
        <input v-model="form.heroTitle" class="admin-input" />
      </div>
      <div style="margin-top: 12px">
        <label class="admin-label">Subtítulo (hero)</label>
        <textarea v-model="form.heroSubtitle" class="admin-textarea" rows="2" />
      </div>

      <h3 class="section-t">Contato</h3>
      <div class="form-grid">
        <div>
          <label class="admin-label">WhatsApp (só números, com DDI)</label>
          <input v-model="form.whatsapp" class="admin-input" placeholder="5567991512269" />
        </div>
        <div>
          <label class="admin-label">Telefone</label>
          <input v-model="form.phone" class="admin-input" placeholder="+5567991512269" />
        </div>
        <div>
          <label class="admin-label">E-mail</label>
          <input v-model="form.email" class="admin-input" type="email" />
        </div>
        <div>
          <label class="admin-label">Cidade</label>
          <input v-model="form.city" class="admin-input" />
        </div>
        <div>
          <label class="admin-label">UF</label>
          <input v-model="form.state" class="admin-input" maxlength="2" />
        </div>
      </div>

      <h3 class="section-t">SEO e redes sociais</h3>
      <p style="color: var(--ink-soft); font-size: 13px; margin: -4px 0 12px">
        Ajuda o Google a encontrar você pelo nome e conectar suas redes.
      </p>
      <div class="form-grid">
        <div>
          <label class="admin-label">Instagram (URL)</label>
          <input v-model="form.instagram" class="admin-input" placeholder="https://instagram.com/seuperfil" />
        </div>
        <div>
          <label class="admin-label">Site (URL, opcional)</label>
          <input v-model="form.website" class="admin-input" placeholder="https://..." />
        </div>
      </div>
      <div style="margin-top: 12px">
        <label class="admin-label">Nomes alternativos / como te buscam (um por linha)</label>
        <textarea
          v-model="alternateNamesText"
          class="admin-textarea"
          rows="3"
          placeholder="TP Imobiliária&#10;Imóveis Pacheco&#10;Tatiane Imóveis"
        />
      </div>

      <p v-if="error" style="color: #b91c1c; margin-top: 14px">{{ error }}</p>
      <p v-if="saved" style="color: var(--wa-dark); margin-top: 14px; font-weight: 600">
        Configurações salvas! ✅
      </p>

      <div style="margin-top: 18px">
        <button class="admin-btn" type="submit" :disabled="saving">
          {{ saving ? 'Salvando...' : 'Salvar configurações' }}
        </button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.section-t {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 15px;
  margin: 22px 0 12px;
  padding-top: 16px;
  border-top: 1px solid var(--line);
}
.section-t:first-of-type {
  border-top: none;
  padding-top: 0;
  margin-top: 4px;
}
.form-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 14px;
}
@media (min-width: 520px) {
  .form-grid {
    grid-template-columns: 1fr 1fr;
  }
}
.color-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.color-swatch {
  width: 46px;
  height: 44px;
  border: 1.5px solid var(--line-2);
  border-radius: 10px;
  padding: 2px;
  background: none;
  cursor: pointer;
}
.preview-box {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-top: 22px;
}
.logo-row {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}
.logo-preview {
  width: 60px;
  height: 60px;
  border-radius: 12px;
  background: var(--brand);
  color: #fff;
  display: grid;
  place-items: center;
  overflow: hidden;
}
.logo-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.logo-preview :deep(svg) {
  width: 30px;
  height: 30px;
}
.file-btn {
  cursor: pointer;
}
@media (min-width: 720px) {
  .form-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}
</style>
