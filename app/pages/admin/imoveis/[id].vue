<script setup lang="ts">
import type { Property, PropertyInput, PropertyImageInput } from '~~/shared/models/property'
import type { Broker } from '~~/shared/models/broker'
import { PROPERTY_TYPES, PROPERTY_TYPE_LABELS, PROPERTY_STATUSES, PROPERTY_STATUS_LABELS } from '~~/shared/models/property'

definePageMeta({ layout: 'admin', middleware: 'admin' })

const route = useRoute()
const tenant = useTenant()
const id = computed(() => String(route.params.id))
const isNew = computed(() => id.value === 'novo')

const form = reactive<Required<Omit<PropertyInput, 'images'>> & { images: PropertyImageInput[] }>({
  code: '',
  title: '',
  type: 'casa',
  purpose: 'venda',
  price: 0,
  neighborhood: '',
  city: tenant.value?.city || '',
  state: tenant.value?.state || '',
  bedrooms: 0,
  bathrooms: 0,
  parking: 0,
  area: 0,
  highStandard: false,
  description: '',
  features: [],
  status: 'active',
  featured: false,
  images: [],
  location: '',
  brokerId: '',
  ownerName: '',
  ownerPhone: '',
})
const featuresText = ref('')

const { data: brokers } = await useAsyncData(
  'admin:brokers:list',
  () => adminFetch<Broker[]>('/api/admin/brokers'),
  { server: false, default: () => [] as Broker[] },
)

const { data: existing } = await useAsyncData(
  `admin:property:${id.value}`,
  async () => (isNew.value ? null : await adminFetch<Property>(`/api/admin/properties/${id.value}`)),
  { server: false },
)

watchEffect(() => {
  const p = existing.value
  if (!p) return
  Object.assign(form, {
    code: p.code,
    title: p.title,
    type: p.type,
    purpose: p.purpose,
    price: p.price,
    neighborhood: p.neighborhood || '',
    city: p.city || '',
    state: p.state || '',
    bedrooms: p.bedrooms,
    bathrooms: p.bathrooms,
    parking: p.parking,
    area: p.area,
    highStandard: p.highStandard,
    description: p.description || '',
    features: p.features,
    status: p.status,
    featured: p.featured,
    // urlSm precisa vir junto: replaceImages regrava as linhas do zero, e sem
    // isto a derivada de 640px seria perdida a cada edição do imóvel.
    images: p.images.map((i) => ({
      url: i.url,
      urlSm: i.urlSm,
      alt: i.alt,
      isCover: i.isCover,
      position: i.position,
    })),
    location: p.location || '',
    brokerId: p.brokerId || '',
    ownerName: p.ownerName || '',
    ownerPhone: p.ownerPhone || '',
  })
  featuresText.value = p.features.join('\n')
})

const saving = ref(false)
const error = ref('')

async function save() {
  saving.value = true
  error.value = ''
  const payload: PropertyInput = {
    ...form,
    brokerId: form.brokerId || null,
    features: featuresText.value.split('\n').map((s) => s.trim()).filter(Boolean),
  }
  try {
    if (isNew.value) {
      await adminFetch('/api/admin/properties', { method: 'POST', body: payload })
    } else {
      await adminFetch(`/api/admin/properties/${id.value}`, { method: 'PUT', body: payload })
    }
    await navigateTo('/admin/imoveis')
  } catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string } }
    error.value = err?.data?.statusMessage || 'Não foi possível salvar. Verifique os campos.'
  } finally {
    saving.value = false
  }
}

useHead(() => ({ title: (isNew.value ? 'Novo imóvel' : 'Editar imóvel') + ' · Painel' }))
</script>

<template>
  <div>
    <NuxtLink to="/admin/imoveis" class="back-link">← Voltar</NuxtLink>
    <h1>{{ isNew ? 'Novo imóvel' : 'Editar imóvel' }}</h1>

    <form class="admin-card" style="margin-top: 16px" @submit.prevent="save">
      <div class="form-grid">
        <div>
          <label class="admin-label">Código *</label>
          <input v-model="form.code" class="admin-input" placeholder="Ex.: NC-0231" required />
        </div>
        <div>
          <label class="admin-label">Título *</label>
          <input v-model="form.title" class="admin-input" placeholder="Ex.: Casa no Jardim Alvorada" required />
        </div>
        <div>
          <label class="admin-label">Tipo *</label>
          <select v-model="form.type" class="admin-select">
            <option v-for="t in PROPERTY_TYPES" :key="t" :value="t">{{ PROPERTY_TYPE_LABELS[t] }}</option>
          </select>
        </div>
        <div>
          <label class="admin-label">Pretensão *</label>
          <select v-model="form.purpose" class="admin-select">
            <option value="venda">Venda</option>
            <option value="aluguel">Aluguel</option>
          </select>
        </div>
        <div>
          <label class="admin-label">Preço (R$) *</label>
          <input v-model.number="form.price" class="admin-input" type="number" min="0" step="1" required />
        </div>
        <div>
          <label class="admin-label">Status</label>
          <select v-model="form.status" class="admin-select">
            <option v-for="s in PROPERTY_STATUSES" :key="s" :value="s">{{ PROPERTY_STATUS_LABELS[s] }}</option>
          </select>
        </div>
        <div>
          <label class="admin-label">Bairro</label>
          <input v-model="form.neighborhood" class="admin-input" />
        </div>
        <div>
          <label class="admin-label">Cidade</label>
          <input v-model="form.city" class="admin-input" />
        </div>
        <div>
          <label class="admin-label">UF</label>
          <input v-model="form.state" class="admin-input" maxlength="2" />
        </div>
        <div>
          <label class="admin-label">Quartos</label>
          <input v-model.number="form.bedrooms" class="admin-input" type="number" min="0" />
        </div>
        <div>
          <label class="admin-label">Banheiros</label>
          <input v-model.number="form.bathrooms" class="admin-input" type="number" min="0" />
        </div>
        <div>
          <label class="admin-label">Vagas</label>
          <input v-model.number="form.parking" class="admin-input" type="number" min="0" />
        </div>
        <div>
          <label class="admin-label">Área (m²)</label>
          <input v-model.number="form.area" class="admin-input" type="number" min="0" step="0.01" />
        </div>
      </div>

      <div class="checks">
        <label><input v-model="form.highStandard" type="checkbox" /> Alto padrão</label>
        <label><input v-model="form.featured" type="checkbox" /> Destaque</label>
      </div>

      <label class="admin-label" style="margin-top: 14px">Descrição</label>
      <textarea v-model="form.description" class="admin-textarea" rows="4" />

      <label class="admin-label" style="margin-top: 14px">Diferenciais (um por linha)</label>
      <textarea v-model="featuresText" class="admin-textarea" rows="4" placeholder="Piscina&#10;Churrasqueira&#10;Portão eletrônico" />

      <label class="admin-label" style="margin-top: 14px">Imagens</label>
      <AdminImageUploader v-model="form.images" />

      <h3 class="int-title">🔒 Informações internas <span>(só no painel, não aparecem no site)</span></h3>
      <div class="form-grid">
        <div style="grid-column: 1 / -1">
          <label class="admin-label">Localização (endereço / referência)</label>
          <input v-model="form.location" class="admin-input" placeholder="Rua, nº, bairro, ponto de referência..." />
        </div>
        <div>
          <label class="admin-label">Corretor que captou</label>
          <select v-model="form.brokerId" class="admin-select">
            <option value="">— Nenhum —</option>
            <option v-for="b in brokers" :key="b.id" :value="b.id">{{ b.name }}</option>
          </select>
          <NuxtLink to="/admin/corretores" class="hint-link">Gerenciar corretores →</NuxtLink>
        </div>
        <div>
          <label class="admin-label">Proprietário — nome</label>
          <input v-model="form.ownerName" class="admin-input" />
        </div>
        <div>
          <label class="admin-label">Proprietário — WhatsApp</label>
          <input v-model="form.ownerPhone" class="admin-input" placeholder="5567999999999" />
        </div>
      </div>

      <p v-if="error" style="color: #b91c1c; margin-top: 14px">{{ error }}</p>

      <div style="margin-top: 18px; display: flex; gap: 10px">
        <button class="admin-btn" type="submit" :disabled="saving">
          {{ saving ? 'Salvando...' : 'Salvar imóvel' }}
        </button>
        <NuxtLink class="admin-btn ghost" to="/admin/imoveis">Cancelar</NuxtLink>
      </div>
    </form>
  </div>
</template>

<style scoped>
.back-link {
  display: inline-block;
  color: var(--ink-soft);
  text-decoration: none;
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 10px;
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
.int-title {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 15px;
  margin: 24px 0 12px;
  padding-top: 16px;
  border-top: 1px dashed var(--line-2);
}
.int-title span {
  font-family: 'Inter', sans-serif;
  font-weight: 500;
  font-size: 12.5px;
  color: var(--ink-soft);
}
.hint-link {
  display: inline-block;
  margin-top: 6px;
  font-size: 12.5px;
  color: var(--brand);
  text-decoration: none;
  font-weight: 600;
}
.checks {
  display: flex;
  gap: 20px;
  margin-top: 14px;
  font-size: 14px;
  font-weight: 600;
}
.checks label {
  display: flex;
  align-items: center;
  gap: 7px;
}
@media (min-width: 720px) {
  .form-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}
</style>
