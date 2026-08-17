import type { Property } from '~~/shared/models/property'
import { listActiveProperties } from '~~/server/repositories/property.repository'

/**
 * Feed de imóveis no padrão VRSync 1.0 (Grupo ZAP / VivaReal / OLX — "Canal Pro").
 * É o formato que os portais consomem: o cliente cola a URL deste feed no painel
 * do Canal Pro e os imóveis publicados sobem/atualizam sozinhos.
 *
 * Multitenant por host: cada domínio serve o feed do seu tenant, então funciona
 * para qualquer cliente sem configuração extra — a URL é sempre
 * `https://<dominio-do-cliente>/feed/imoveis.xml`.
 *
 * Spec: https://developers.grupozap.com/#vrsync
 */

// UF -> nome do estado (VRSync aceita a sigla, mas o nome completo evita rejeição
// em validações mais rígidas de alguns portais).
const UF_NAMES: Record<string, string> = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia',
  CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás',
  MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais',
  PA: 'Pará', PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí',
  RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul',
  RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina', SP: 'São Paulo',
  SE: 'Sergipe', TO: 'Tocantins',
}

// Nossos tipos -> ontologia de PropertyType do VRSync.
const PROPERTY_TYPE_MAP: Record<Property['type'], string> = {
  casa: 'Residential / Home',
  sobrado: 'Residential / Home',
  apartamento: 'Residential / Apartment',
  terreno: 'Residential / Land Lot',
}

/** Escapa texto para conteúdo/atributo XML. */
function esc(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function listingXml(
  p: Property,
  contact: { name: string; email: string; phone: string },
  uf: string,
  origin: string,
): string {
  const isRent = p.purpose === 'aluguel'
  const stateAbbr = (p.state || uf || '').toUpperCase()
  const stateName = UF_NAMES[stateAbbr] || stateAbbr
  const type = PROPERTY_TYPE_MAP[p.type]
  const isLand = p.type === 'terreno'

  // Ordena imagens: capa primeiro, depois por posição. A primeira vira primary.
  const images = [...p.images].sort((a, b) => {
    if (a.isCover !== b.isCover) return a.isCover ? -1 : 1
    return a.position - b.position
  })

  const priceTag = isRent
    ? `<RentalPrice period="Monthly" currency="BRL">${Math.round(p.price)}</RentalPrice>`
    : `<ListPrice currency="BRL">${Math.round(p.price)}</ListPrice>`

  const areaTag = p.area
    ? isLand
      ? `<LotArea unit="square metres">${p.area}</LotArea>`
      : `<LivingArea unit="square metres">${p.area}</LivingArea>`
    : ''

  const details = [
    `<PropertyType>${esc(type)}</PropertyType>`,
    p.description ? `<Description>${esc(p.description)}</Description>` : '',
    priceTag,
    areaTag,
    !isLand && p.bedrooms ? `<Bedrooms>${p.bedrooms}</Bedrooms>` : '',
    !isLand && p.bathrooms ? `<Bathrooms>${p.bathrooms}</Bathrooms>` : '',
    !isLand && p.suites ? `<Suites>${p.suites}</Suites>` : '',
    !isLand && p.parking ? `<Garage type="Parking Space">${p.parking}</Garage>` : '',
    p.features.length
      ? `<Features>${p.features.map((f) => `<Feature>${esc(f)}</Feature>`).join('')}</Features>`
      : '',
  ]
    .filter(Boolean)
    .join('')

  const location = [
    `<Country abbreviation="BR">Brasil</Country>`,
    stateAbbr ? `<State abbreviation="${esc(stateAbbr)}">${esc(stateName)}</State>` : '',
    p.city ? `<City>${esc(p.city)}</City>` : '',
    p.neighborhood ? `<Neighborhood>${esc(p.neighborhood)}</Neighborhood>` : '',
  ]
    .filter(Boolean)
    .join('')

  const media = images.length
    ? `<Media>${images
        .map(
          (img) =>
            `<Item medium="image"${img.isCover ? ' primary="true"' : ''}` +
            `${img.alt ? ` caption="${esc(img.alt)}"` : ''}>${esc(img.url)}</Item>`,
        )
        .join('')}</Media>`
    : ''

  const contactTag = [
    contact.name ? `<Name>${esc(contact.name)}</Name>` : '',
    contact.email ? `<Email>${esc(contact.email)}</Email>` : '',
    contact.phone ? `<Telephone>${esc(contact.phone)}</Telephone>` : '',
  ]
    .filter(Boolean)
    .join('')

  return (
    `<Listing>` +
    `<ListingID>${esc(p.code)}</ListingID>` +
    `<Title>${esc(p.title)}</Title>` +
    `<TransactionType>${isRent ? 'For Rent' : 'For Sale'}</TransactionType>` +
    `<ListDate>${new Date(p.createdAt).toISOString()}</ListDate>` +
    `<LastUpdateDate>${new Date(p.updatedAt).toISOString()}</LastUpdateDate>` +
    `<DetailViewUrl>${esc(origin + '/imovel/' + encodeURIComponent(p.code))}</DetailViewUrl>` +
    `<Details>${details}</Details>` +
    (location ? `<Location displayAddress="Neighborhood">${location}</Location>` : '') +
    (contactTag ? `<ContactInfo>${contactTag}</ContactInfo>` : '') +
    media +
    `</Listing>`
  )
}

export default defineEventHandler(async (event) => {
  const tenant = useTenantContext(event)
  const origin = getRequestURL(event, { xForwardedHost: true, xForwardedProto: true }).origin

  // Reaproveita o mesmo cache do sitemap/llms: a lista completa de ativos do tenant.
  const list = await cached(tenantCacheKey(tenant.id, 'properties:active'), () =>
    listActiveProperties(publicSupabase(), tenant.id),
  )

  const contact = {
    name: tenant.name || '',
    email: tenant.email || '',
    // wa.me/tel: guardam dígitos com DDI; o portal aceita o número em texto.
    phone: (tenant.whatsapp || tenant.phone || '').replace(/\D/g, ''),
  }
  const uf = (tenant.state || '').toUpperCase()

  const listings = list.map((p) => listingXml(p, contact, uf, origin)).join('')

  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<ListingDataFeed xmlns="http://www.vivareal.com/schemas/1.0/VRSync" ` +
    `xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n` +
    `<Header>` +
    `<Provider>${esc(tenant.name)}</Provider>` +
    (contact.email ? `<Email>${esc(contact.email)}</Email>` : '') +
    (contact.name ? `<ContactName>${esc(contact.name)}</ContactName>` : '') +
    `<PublishDate>${new Date().toISOString()}</PublishDate>` +
    `</Header>\n` +
    `<Listings>${listings}</Listings>\n` +
    `</ListingDataFeed>\n`

  setHeader(event, 'content-type', 'application/xml; charset=utf-8')
  // 10 min: portais buscam o feed periodicamente, não precisa ser tempo real.
  setHeader(event, 'cache-control', 'public, max-age=600')
  return body
})
