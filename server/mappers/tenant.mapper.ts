import type { Database, Json } from '~~/shared/types/database.types'
import type { HeroImagePosition, Tenant, TenantSettingsInput } from '~~/shared/models/tenant'
import { sanitizeFooterLinks } from '~~/shared/utils/footer-links'
import { sanitizeFooterPageOverrides } from '~~/shared/utils/footer-pages'
import { sanitizeAboutContent } from '~~/shared/utils/about-content'

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
    heroImage: row.hero_image,
    heroImagePosition: (row.hero_image_position as HeroImagePosition) || 'right',
    heroCtaLabel: row.hero_cta_label,
    heroCtaHref: row.hero_cta_href,
    whatsapp: row.whatsapp,
    phone: row.phone,
    email: row.email,
    creci: row.creci,
    city: row.city,
    state: row.state,
    addressStreet: row.address_street,
    addressNumber: row.address_number,
    addressComplement: row.address_complement,
    addressNeighborhood: row.address_neighborhood,
    addressZip: row.address_zip,
    latitude: row.latitude,
    longitude: row.longitude,
    brandPrimary: row.brand_primary,
    brandAccent: row.brand_accent,
    whatsappButtonColor: row.whatsapp_button_color,
    logoUrl: row.logo_url,
    faviconUrl: row.favicon_url,
    instagram: row.instagram,
    website: row.website,
    alternateNames: row.alternate_names ?? [],
    footerText: row.footer_text ?? null,
    // Passa pelo saneador na LEITURA também: a coluna é JSONB sem CHECK, então
    // linha gravada antes desta validação existir (ou por SQL direto) não pode
    // colocar um href arbitrário no rodapé público.
    footerLinks: sanitizeFooterLinks(row.footer_links),
    footerPages: sanitizeFooterPageOverrides(row.footer_pages),
    // Mesma razão do footerLinks: saneia também na leitura, para uma linha
    // gravada antes do saneador existir (ou por SQL direto) não quebrar a página.
    aboutContent: sanitizeAboutContent(row.about_content),
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
  if (input.heroImage !== undefined) row.hero_image = input.heroImage
  if (input.heroImagePosition !== undefined) row.hero_image_position = input.heroImagePosition
  if (input.heroCtaLabel !== undefined) row.hero_cta_label = input.heroCtaLabel
  if (input.heroCtaHref !== undefined) row.hero_cta_href = input.heroCtaHref
  if (input.whatsapp !== undefined) row.whatsapp = input.whatsapp
  if (input.phone !== undefined) row.phone = input.phone
  if (input.email !== undefined) row.email = input.email
  if (input.creci !== undefined) row.creci = input.creci
  if (input.city !== undefined) row.city = input.city
  if (input.state !== undefined) row.state = input.state
  if (input.addressStreet !== undefined) row.address_street = input.addressStreet
  if (input.addressNumber !== undefined) row.address_number = input.addressNumber
  if (input.addressComplement !== undefined) row.address_complement = input.addressComplement
  if (input.addressNeighborhood !== undefined) row.address_neighborhood = input.addressNeighborhood
  if (input.addressZip !== undefined) row.address_zip = input.addressZip
  if (input.latitude !== undefined) row.latitude = input.latitude
  if (input.longitude !== undefined) row.longitude = input.longitude
  if (input.brandPrimary !== undefined) row.brand_primary = input.brandPrimary
  if (input.brandAccent !== undefined) row.brand_accent = input.brandAccent
  if (input.whatsappButtonColor !== undefined) row.whatsapp_button_color = input.whatsappButtonColor
  if (input.logoUrl !== undefined) row.logo_url = input.logoUrl
  if (input.faviconUrl !== undefined) row.favicon_url = input.faviconUrl
  if (input.instagram !== undefined) row.instagram = input.instagram
  if (input.website !== undefined) row.website = input.website
  if (input.alternateNames !== undefined) row.alternate_names = input.alternateNames
  if (input.footerText !== undefined) row.footer_text = input.footerText
  // As casts para Json são o supabase-js exigindo um índice `[key: string]:
  // Json` que os tipos de domínio (FooterLink, AboutPageContent...) não têm por
  // serem interfaces com campos nomeados — a forma real gravada no JSONB já é
  // exatamente esta, o saneador é quem garante isso, não o TypeScript aqui.
  if (input.footerLinks !== undefined) row.footer_links = sanitizeFooterLinks(input.footerLinks) as unknown as Json
  if (input.footerPages !== undefined) row.footer_pages = sanitizeFooterPageOverrides(input.footerPages) as unknown as Json
  if (input.aboutContent !== undefined) row.about_content = sanitizeAboutContent(input.aboutContent) as unknown as Json
  return row
}
