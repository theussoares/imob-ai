import type { FooterLink } from '~~/shared/utils/footer-links'
import type { FooterPageOverrides } from '~~/shared/utils/footer-pages'
import type { AboutPageContent } from '~~/shared/models/about-page'
import type { AiTone } from '~~/shared/models/ai-tone'
import type { HeaderStyle, SiteTheme } from '~~/shared/models/site-theme'

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
  /** Tema da vitrine (fonte, raio, card). Ver shared/models/site-theme.ts. */
  siteTheme: SiteTheme
  /** Estilo do cabeçalho do site, independente do tema. */
  headerStyle: HeaderStyle
  heroCtaLabel: string | null
  heroCtaHref: string | null
  whatsapp: string | null
  phone: string | null
  email: string | null
  creci: string | null
  /**
   * Anuncia a Área do Cliente no site (header e rodapé).
   *
   * ⚠️ NÃO é controle de acesso. Desligar tira o link do site; não fecha o
   * portal. O entitlement de verdade foi decidido no plano (tabela
   * `tenant_features` lida dentro de `is_portal_user()`) e ainda não existe.
   */
  portalEnabled: boolean
  /**
   * A página "Quem somos" aparece no site desta imobiliária.
   *
   * Mesma dupla do `portalEnabled`: esta coluna é a escolha da imobiliária, e
   * `tenant_features` diz se ela tem o recurso. O payload público carrega só o
   * produto dos dois — ver `comLinksEfetivos` em `server/utils/tenant.ts`.
   */
  aboutEnabled: boolean
  city: string | null
  state: string | null
  /** Endereço estruturado, para mostrar no rodapé com mapa e alimentar o schema.org. Tudo opcional. */
  addressStreet: string | null
  addressNumber: string | null
  addressComplement: string | null
  addressNeighborhood: string | null
  addressZip: string | null
  /** Coordenadas do pino no mapa. Junto com o endereço, mas independentes: um pode faltar sem o outro. */
  latitude: number | null
  longitude: number | null
  brandPrimary: string
  brandAccent: string
  /** Cor do botão/CTA de WhatsApp. Vazio cai no verde padrão do WhatsApp (`--wa` em main.css). */
  whatsappButtonColor: string | null
  logoUrl: string | null
  /** Ícone do site. Vazio cai no /favicon.svg gerado (inicial + cor da marca). */
  faviconUrl: string | null
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
  /** Conteúdo da página "Quem somos", em blocos. Ver shared/models/about-page.ts. */
  aboutContent: AboutPageContent
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
  siteTheme?: SiteTheme
  headerStyle?: HeaderStyle
  heroCtaLabel?: string | null
  heroCtaHref?: string | null
  whatsapp?: string | null
  phone?: string | null
  email?: string | null
  creci?: string | null
  portalEnabled?: boolean
  aboutEnabled?: boolean
  city?: string | null
  state?: string | null
  addressStreet?: string | null
  addressNumber?: string | null
  addressComplement?: string | null
  addressNeighborhood?: string | null
  addressZip?: string | null
  latitude?: number | null
  longitude?: number | null
  brandPrimary?: string
  brandAccent?: string
  whatsappButtonColor?: string | null
  logoUrl?: string | null
  faviconUrl?: string | null
  instagram?: string | null
  website?: string | null
  alternateNames?: string[]
  footerText?: string | null
  footerLinks?: FooterLink[]
  footerPages?: FooterPageOverrides
  aboutContent?: AboutPageContent
  /**
   * Tom da descrição por IA. Fica em `TenantSettingsInput` (escrita), NUNCA em
   * `Tenant` (leitura): `/api/tenant` devolve o modelo `Tenant` inteiro ao
   * público, e o tom é lido à parte por `getAiTone` com `select('ai_tone')`
   * explícito. Ver `server/repositories/tenant.repository.ts`.
   */
  aiTone?: AiTone
}
