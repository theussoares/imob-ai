import type { FooterLink } from '~~/shared/utils/footer-links'

export type HeroImagePosition = 'left' | 'right' | 'background'

/** Modelo de domínio do tenant (imobiliária/corretor). */
export interface Tenant {
  id: string
  slug: string
  name: string
  tagline: string | null
  heroTitle: string | null
  heroSubtitle: string | null
  heroImage: string | null
  heroImagePosition: HeroImagePosition
  heroCtaLabel: string | null
  heroCtaHref: string | null
  whatsapp: string | null
  phone: string | null
  email: string | null
  creci: string | null
  city: string | null
  state: string | null
  brandPrimary: string
  brandAccent: string
  logoUrl: string | null
  instagram: string | null
  website: string | null
  alternateNames: string[]
  /** Texto do rodapé. Vazio cai numa frase gerada com a cidade. */
  footerText: string | null
  /** Links extras do rodapé, na ordem em que aparecem. */
  footerLinks: FooterLink[]
  active: boolean
}

/** Campos editáveis nas configurações do painel. */
export interface TenantSettingsInput {
  name?: string
  tagline?: string | null
  heroTitle?: string | null
  heroSubtitle?: string | null
  heroImage?: string | null
  heroImagePosition?: HeroImagePosition
  heroCtaLabel?: string | null
  heroCtaHref?: string | null
  whatsapp?: string | null
  phone?: string | null
  email?: string | null
  creci?: string | null
  city?: string | null
  state?: string | null
  brandPrimary?: string
  brandAccent?: string
  logoUrl?: string | null
  instagram?: string | null
  website?: string | null
  alternateNames?: string[]
  footerText?: string | null
  footerLinks?: FooterLink[]
}
