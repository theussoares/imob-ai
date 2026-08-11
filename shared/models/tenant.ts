/** Modelo de domínio do tenant (imobiliária/corretor). */
export interface Tenant {
  id: string
  slug: string
  name: string
  tagline: string | null
  heroTitle: string | null
  heroSubtitle: string | null
  whatsapp: string | null
  phone: string | null
  email: string | null
  creci: string | null
  city: string | null
  state: string | null
  brandPrimary: string
  brandAccent: string
  logoUrl: string | null
  active: boolean
}

/** Campos editáveis nas configurações do painel. */
export interface TenantSettingsInput {
  name?: string
  tagline?: string | null
  heroTitle?: string | null
  heroSubtitle?: string | null
  whatsapp?: string | null
  phone?: string | null
  email?: string | null
  creci?: string | null
  city?: string | null
  state?: string | null
  brandPrimary?: string
  brandAccent?: string
  logoUrl?: string | null
}
