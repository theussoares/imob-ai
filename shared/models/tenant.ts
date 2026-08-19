import type { FooterLink } from '~~/shared/utils/footer-links'
import type { FooterPageOverrides } from '~~/shared/utils/footer-pages'

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
  /**
   * NÃO USADO. Ficou de uma época em que a imobiliária tinha site próprio antes
   * do nosso. Não aparece em tela nem no `sameAs`, porque "outro site seu" não
   * faz sentido quando o site É esta página — e apontar a própria URL no
   * `sameAs` é redundante: o JSON-LD já declara isso no `url`.
   *
   * A coluna continua no banco (vazia em todos os tenants) para não gastar uma
   * migration destrutiva sem ganho. Se a necessidade voltar, ela vem como
   * "outras redes" (Facebook, TikTok), que é o que de fato pertence ao `sameAs`.
   */
  website: string | null
  alternateNames: string[]
  /** Texto do rodapé. Vazio cai numa frase gerada com a cidade. */
  footerText: string | null
  /** Links extras do rodapé, na ordem em que aparecem. */
  footerLinks: FooterLink[]
  /** Ajustes do cliente sobre as páginas internas — só o que ele mudou. */
  footerPages: FooterPageOverrides
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
  footerPages?: FooterPageOverrides
}
