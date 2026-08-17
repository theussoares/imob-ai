<script setup lang="ts">
import type { Tenant, TenantSettingsInput } from '~~/shared/models/tenant'

definePageMeta({ layout: 'admin', middleware: 'admin' })

const tenant = useTenant()

const form = reactive<TenantSettingsInput>({
  name: '',
  tagline: '',
  heroTitle: '',
  heroSubtitle: '',
  heroImage: '',
  heroImagePosition: 'right',
  heroCtaLabel: '',
  heroCtaHref: '',
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

// Campos exibem +55 (67) 99217-1768; o model guarda os dígitos com DDI (o que os
// links wa.me/tel: já consomem).
const { display: whatsappDisplay, onInput: onWhatsappInput, isValid: whatsappValid } =
  usePhoneInput(toRef(form, 'whatsapp'), 'whatsapp')
const { display: phoneDisplay, onInput: onPhoneInput, isValid: phoneValid } =
  usePhoneInput(toRef(form, 'phone'), 'whatsapp')

let inited = false
watchEffect(() => {
  if (tenant.value && !inited) {
    inited = true
    Object.assign(form, {
      name: tenant.value.name,
      tagline: tenant.value.tagline || '',
      heroTitle: tenant.value.heroTitle || '',
      heroSubtitle: tenant.value.heroSubtitle || '',
      heroImage: tenant.value.heroImage || '',
      heroImagePosition: tenant.value.heroImagePosition,
      heroCtaLabel: tenant.value.heroCtaLabel || '',
      heroCtaHref: tenant.value.heroCtaHref || '',
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
  const slug = tenant.value?.slug
  if (!slug) {
    alert('Não foi possível identificar a imobiliária. Recarregue a página.')
    input.value = ''
    return
  }
  uploadingLogo.value = true
  try {
    const client = await getAdminSupabase()
    // Logo é exibido a 40px — 256px de WebP sobra e evita subir PNG de vários MB.
    const resizable = isResizableImage(file)
    const body: Blob = resizable ? await resizeToWebp(file, 256) : file
    const ext = resizable ? 'webp' : file.name.split('.').pop() || 'png'
    const path = `${slug}/logo-${Date.now()}.${ext}`
    // upsert:false — o path já é único (timestamp); upsert exigiria uma policy de
    // SELECT em storage.objects (Supabase checa existência antes de sobrescrever),
    // que não temos configurada, e falharia com "row-level security policy".
    const { error } = await client.storage.from('tenant-logos').upload(path, body, {
      upsert: false,
      cacheControl: '31536000',
      contentType: resizable ? 'image/webp' : file.type,
    })
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

const uploadingHeroImage = ref(false)
async function onHeroImage(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const slug = tenant.value?.slug
  if (!slug) {
    alert('Não foi possível identificar a imobiliária. Recarregue a página.')
    input.value = ''
    return
  }
  uploadingHeroImage.value = true
  try {
    const client = await getAdminSupabase()
    // Hero é full-bleed: 1600px de WebP cobre telas grandes com uma fração dos bytes.
    const resizable = isResizableImage(file)
    const body: Blob = resizable ? await resizeToWebp(file, IMAGE_SIZE_LG) : file
    const ext = resizable ? 'webp' : file.name.split('.').pop() || 'jpg'
    const path = `${slug}/hero-${Date.now()}.${ext}`
    const { error } = await client.storage.from('tenant-hero').upload(path, body, {
      upsert: false,
      cacheControl: '31536000',
      contentType: resizable ? 'image/webp' : file.type,
    })
    if (error) throw error
    const { data } = client.storage.from('tenant-hero').getPublicUrl(path)
    form.heroImage = data.publicUrl
  } catch (err: unknown) {
    const m = err as { message?: string }
    alert('Falha no upload da foto: ' + (m?.message || 'erro'))
  } finally {
    uploadingHeroImage.value = false
    input.value = ''
  }
}

// Preview ao vivo do hero — reaproveita o próprio componente público, alimentado
// pelo form em edição (não pelo tenant salvo).
const previewTenant = computed<Tenant | null>(() => {
  if (!tenant.value) return null
  return {
    ...tenant.value,
    name: form.name || tenant.value.name,
    tagline: form.tagline || null,
    heroTitle: form.heroTitle || null,
    heroSubtitle: form.heroSubtitle || null,
    heroImage: form.heroImage || null,
    heroImagePosition: form.heroImagePosition || 'right',
    heroCtaLabel: form.heroCtaLabel || null,
    heroCtaHref: form.heroCtaHref || null,
  }
})

// URL do feed de imóveis para os portais (ZAP/VivaReal/OLX via Canal Pro).
// Deriva do domínio público do cliente: no host de painel (painel.<dominio>)
// remove o prefixo para apontar o feed ao site, não ao admin.
const feedUrl = ref('')
const feedCopied = ref(false)
onMounted(() => {
  const host = window.location.host.replace(/^(painel|admin)\./, '')
  feedUrl.value = `${window.location.protocol}//${host}/feed/imoveis.xml`
})
async function copyFeed() {
  try {
    await navigator.clipboard.writeText(feedUrl.value)
    feedCopied.value = true
    setTimeout(() => (feedCopied.value = false), 2000)
  } catch {
    /* clipboard indisponível: o usuário copia manualmente do link */
  }
}

const saving = ref(false)
const saved = ref(false)
const error = ref('')

async function save() {
  if (!whatsappValid.value || !phoneValid.value) {
    error.value = 'Confira os números de contato (com DDD).'
    return
  }
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

      <h3 class="section-t">Hero (topo da home)</h3>
      <div>
        <label class="admin-label">Título principal</label>
        <input v-model="form.heroTitle" class="admin-input" />
      </div>
      <div style="margin-top: 12px">
        <label class="admin-label">Subtítulo</label>
        <textarea v-model="form.heroSubtitle" class="admin-textarea" rows="2" />
      </div>

      <div class="form-grid" style="margin-top: 14px">
        <div>
          <label class="admin-label">Foto (institucional, da equipe, de um imóvel...)</label>
          <div class="logo-row">
            <div class="hero-img-preview">
              <img v-if="form.heroImage" :src="form.heroImage" alt="Foto do hero" />
              <AppIcon v-else name="home" />
            </div>
            <label class="admin-btn ghost file-btn">
              {{ uploadingHeroImage ? 'Enviando...' : 'Enviar foto' }}
              <input type="file" accept="image/*" hidden @change="onHeroImage" />
            </label>
            <button v-if="form.heroImage" type="button" class="admin-btn ghost" @click="form.heroImage = ''">
              Remover
            </button>
          </div>
          <p class="hint-text">
            Sem foto, o hero aparece só com texto (como hoje). Com foto, vira um layout
            dividido — recomendado: retrato ou quadrada, mínimo 800×1000px.
          </p>
        </div>
        <div v-if="form.heroImage">
          <label class="admin-label">Posição da foto</label>
          <div class="pos-toggle" role="radiogroup" aria-label="Posição da foto no hero">
            <button
              type="button"
              class="pos-btn"
              :class="{ on: form.heroImagePosition === 'right' }"
              @click="form.heroImagePosition = 'right'"
            >
              <span class="pos-mock"><span class="pos-text" /><span class="pos-img" /></span>
              Foto à direita
            </button>
            <button
              type="button"
              class="pos-btn"
              :class="{ on: form.heroImagePosition === 'left' }"
              @click="form.heroImagePosition = 'left'"
            >
              <span class="pos-mock"><span class="pos-img" /><span class="pos-text" /></span>
              Foto à esquerda
            </button>
            <button
              type="button"
              class="pos-btn"
              :class="{ on: form.heroImagePosition === 'background' }"
              @click="form.heroImagePosition = 'background'"
            >
              <span class="pos-mock pos-mock-bg"><span class="pos-text" /></span>
              Foto de fundo
            </button>
          </div>
        </div>
      </div>

      <div class="form-grid" style="margin-top: 14px">
        <div>
          <label class="admin-label">Botão do hero — texto (opcional)</label>
          <input v-model="form.heroCtaLabel" class="admin-input" placeholder="Ex.: Conheça nossa história" />
        </div>
        <div>
          <label class="admin-label">Botão do hero — link (opcional)</label>
          <input v-model="form.heroCtaHref" class="admin-input" placeholder="/sobre ou https://..." />
        </div>
      </div>
      <p class="hint-text">O botão só aparece se texto e link estiverem preenchidos.</p>

      <div class="hero-preview-wrap">
        <span class="hero-preview-label">Pré-visualização</span>
        <div class="hero-preview-box">
          <Hero :tenant="previewTenant" />
        </div>
      </div>

      <h3 class="section-t">Contato</h3>
      <div class="form-grid">
        <div>
          <label class="admin-label">WhatsApp</label>
          <input
            :value="whatsappDisplay"
            class="admin-input"
            type="tel"
            inputmode="numeric"
            placeholder="+55 (67) 99217-1768"
            @input="onWhatsappInput"
          />
          <p v-if="!whatsappValid" class="field-err">Número inválido (com DDD).</p>
        </div>
        <div>
          <label class="admin-label">Telefone</label>
          <input
            :value="phoneDisplay"
            class="admin-input"
            type="tel"
            inputmode="numeric"
            placeholder="+55 (67) 3521-1234"
            @input="onPhoneInput"
          />
          <p v-if="!phoneValid" class="field-err">Número inválido (com DDD).</p>
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

      <h3 class="section-t">Integrações · Portais (ZAP, VivaReal, OLX)</h3>
      <p style="color: var(--ink-soft); font-size: 13px; margin: -4px 0 12px">
        Cole o link abaixo no seu painel do Canal Pro (Grupo OLX / ZAP). Os imóveis
        publicados aqui aparecem e se atualizam sozinhos nos portais.
      </p>
      <div class="feed-row">
        <a class="feed-url" :href="feedUrl" target="_blank" rel="noopener">{{ feedUrl }}</a>
        <button type="button" class="admin-btn ghost" @click="copyFeed">
          {{ feedCopied ? 'Copiado! ✅' : 'Copiar link' }}
        </button>
      </div>
      <p class="hint-text">
        Só entram no feed os imóveis com status <strong>Publicado</strong>. O portal
        cobra o plano de anúncios à parte — a integração em si não tem custo.
      </p>

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
.field-err {
  color: #b91c1c;
  font-size: 12.5px;
  margin: 4px 0 0;
}
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
.hero-img-preview {
  width: 60px;
  height: 60px;
  border-radius: 12px;
  background: var(--surface);
  border: 1.5px solid var(--line-2);
  color: var(--ink-soft);
  display: grid;
  place-items: center;
  overflow: hidden;
}
.hero-img-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.hero-img-preview :deep(svg) {
  width: 26px;
  height: 26px;
}
.hint-text {
  font-size: 12.5px;
  color: var(--ink-soft);
  margin: 6px 0 0;
}
.feed-row {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}
.feed-url {
  flex: 1;
  min-width: 220px;
  padding: 11px 14px;
  border: 1.5px solid var(--line-2);
  border-radius: 10px;
  background: var(--surface);
  color: var(--brand);
  font-size: 13.5px;
  word-break: break-all;
  text-decoration: none;
}
.pos-toggle {
  display: flex;
  gap: 8px;
}
.pos-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 10px;
  border: 1.5px solid var(--line-2);
  border-radius: 10px;
  background: var(--paper);
  font-size: 12.5px;
  font-weight: 600;
  color: var(--ink-soft);
  cursor: pointer;
}
.pos-btn.on {
  border-color: var(--brand);
  color: var(--ink);
  background: var(--brand-ghost);
}
.pos-mock {
  display: flex;
  gap: 3px;
  width: 100%;
  height: 26px;
}
.pos-mock .pos-text,
.pos-mock .pos-img {
  flex: 1;
  border-radius: 4px;
  background: var(--line-2);
}
.pos-btn.on .pos-img {
  background: var(--brand);
}
.pos-mock-bg {
  position: relative;
  background: var(--ink);
}
.pos-mock-bg .pos-text {
  position: absolute;
  inset: 6px 40% 6px 6px;
  background: rgba(255, 255, 255, 0.55);
}
.pos-btn.on .pos-mock-bg {
  background: var(--brand);
}
.hero-preview-wrap {
  margin-top: 22px;
  padding-top: 18px;
  border-top: 1px dashed var(--line-2);
}
.hero-preview-label {
  display: block;
  font-size: 12px;
  font-weight: 700;
  color: var(--ink-soft);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 8px;
}
.hero-preview-box {
  border: 1.5px solid var(--line-2);
  border-radius: 14px;
  overflow: hidden;
  background: var(--surface);
}
@media (min-width: 720px) {
  .form-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}
</style>
