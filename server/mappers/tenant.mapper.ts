import type { Database } from '~~/shared/types/database.types'
import type { Tenant, TenantSettingsInput } from '~~/shared/models/tenant'

type TenantRow = Database['public']['Tables']['tenants']['Row']
type TenantUpdate = Database['public']['Tables']['tenants']['Update']

export function toTenantModel(row: TenantRow): Tenant {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    tagline: row.tagline,
    heroTitle: row.hero_title,
    heroSubtitle: row.hero_subtitle,
    whatsapp: row.whatsapp,
    phone: row.phone,
    email: row.email,
    creci: row.creci,
    city: row.city,
    state: row.state,
    brandPrimary: row.brand_primary,
    brandAccent: row.brand_accent,
    logoUrl: row.logo_url,
    active: row.active,
  }
}

/** Converte o payload de configurações do painel numa row de atualização. */
export function toTenantUpdateRow(input: TenantSettingsInput): TenantUpdate {
  const row: TenantUpdate = {}
  if (input.name !== undefined) row.name = input.name
  if (input.tagline !== undefined) row.tagline = input.tagline
  if (input.heroTitle !== undefined) row.hero_title = input.heroTitle
  if (input.heroSubtitle !== undefined) row.hero_subtitle = input.heroSubtitle
  if (input.whatsapp !== undefined) row.whatsapp = input.whatsapp
  if (input.phone !== undefined) row.phone = input.phone
  if (input.email !== undefined) row.email = input.email
  if (input.creci !== undefined) row.creci = input.creci
  if (input.city !== undefined) row.city = input.city
  if (input.state !== undefined) row.state = input.state
  if (input.brandPrimary !== undefined) row.brand_primary = input.brandPrimary
  if (input.brandAccent !== undefined) row.brand_accent = input.brandAccent
  if (input.logoUrl !== undefined) row.logo_url = input.logoUrl
  return row
}
