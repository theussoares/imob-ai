import type { Tenant, TenantSettingsInput } from '~~/shared/models/tenant'

type Field = keyof TenantSettingsInput

/**
 * Formulário de configurações do tenant, compartilhado entre as duas telas
 * ("Meu site" e "Configurações").
 *
 * Cada tela declara os campos que possui e o salvamento envia SÓ esses. Antes um
 * único botão mandava os ~20 campos de uma vez: mexer no título do hero regravava
 * cor da marca, CRECI e tudo mais, e uma validação falhando num campo distante
 * derrubava o salvamento sem deixar claro o motivo. O endpoint já faz update
 * parcial (toTenantUpdateRow só toca no que vem definido), então mandar um
 * subconjunto é seguro.
 */
export function useTenantSettings(fields: Field[]) {
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
    footerText: '',
    footerLinks: [],
    footerPages: {},
  })
  const alternateNamesText = ref('')

  // O tenant chega de forma assíncrona; `inited` evita que o watch sobrescreva o
  // que o usuário já digitou quando o objeto for atualizado depois do save.
  let inited = false
  watchEffect(() => {
    if (!tenant.value || inited) return
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
      footerText: tenant.value.footerText || '',
      // Cópia: editar a lista na tela não pode alterar o tenant carregado antes
      // de salvar, senão cancelar deixaria o estado sujo.
      footerLinks: (tenant.value.footerLinks || []).map((l) => ({ ...l })),
      // Cópia rasa por chave, pelo mesmo motivo dos links: editar na tela não
      // pode sujar o tenant carregado antes de salvar.
      footerPages: Object.fromEntries(Object.entries(tenant.value.footerPages || {}).map(([k, v]) => [k, { ...v }])),
    })
    alternateNamesText.value = (tenant.value.alternateNames || []).join('\n')
  })

  const saving = ref(false)
  const saved = ref(false)
  const error = ref('')

  /** Envia só os campos desta tela. `validate` roda antes e aborta com a mensagem. */
  async function save(validate?: () => string | null) {
    const problem = validate?.()
    if (problem) {
      error.value = problem
      return
    }
    saving.value = true
    saved.value = false
    error.value = ''

    const body: TenantSettingsInput = {}
    for (const f of fields) {
      if (f === 'alternateNames') {
        body.alternateNames = alternateNamesText.value
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean)
        continue
      }
      // @ts-expect-error índice dinâmico sobre chaves conhecidas do input
      body[f] = form[f]
    }

    try {
      tenant.value = await adminFetch<Tenant>('/api/admin/tenant', { method: 'PUT', body })
      saved.value = true
    } catch (e: unknown) {
      const err = e as { data?: { statusMessage?: string } }
      error.value = err?.data?.statusMessage || 'Não foi possível salvar.'
    } finally {
      saving.value = false
    }
  }

  return { tenant, form, alternateNamesText, saving, saved, error, save }
}
