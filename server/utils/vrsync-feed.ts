import type { Property } from '~~/shared/models/property'
import { PROPERTY_TYPE_REGISTRY } from '~~/shared/models/property'
import { propertyPath } from '~~/shared/utils/property-url'
import { onlyDigits } from '~~/shared/utils/phone'
import {
  ehSemComodos,
  pendenciasVrsync,
  usageTypeVrsync,
  VRSYNC_DESCRICAO_MAX,
  VRSYNC_TITULO_MAX,
} from '~~/shared/utils/vrsync'

/**
 * Monta o XML VRSync 1.0 (Grupo OLX / "Canal Pro"). Função pura, separada da
 * rota, para que o formato seja testado sem subir o Nuxt — foi a falta desse
 * teste que deixou o feed meses no ar sem o CEP que o portal exige.
 *
 * Spec: https://developers.grupozap.com/feeds/vrsync/
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

export interface VrsyncContato {
  name: string
  email: string
  phone: string
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

function corta(texto: string, max: number): string {
  const t = texto.trim()
  return t.length <= max ? t : t.slice(0, max - 1).trimEnd() + '…'
}

function listingXml(p: Property, contato: VrsyncContato, origin: string): string {
  const isRent = p.purpose === 'aluguel'
  const stateAbbr = (p.state || '').toUpperCase()
  const stateName = UF_NAMES[stateAbbr] || stateAbbr
  const semComodos = ehSemComodos(p)

  // O mapper já entrega capa primeiro; o sort fica como rede para quem montar
  // o modelo por outro caminho.
  const images = [...p.images].sort((a, b) => {
    if (a.isCover !== b.isCover) return a.isCover ? -1 : 1
    return a.position - b.position
  })

  const priceTag = isRent
    ? `<RentalPrice period="Monthly" currency="BRL">${Math.round(p.price)}</RentalPrice>`
    : `<ListPrice currency="BRL">${Math.round(p.price)}</ListPrice>`

  const areaTag = semComodos
    ? `<LotArea unit="square metres">${p.area}</LotArea>`
    : `<LivingArea unit="square metres">${p.area}</LivingArea>`

  const details = [
    `<UsageType>${usageTypeVrsync(p)}</UsageType>`,
    `<PropertyType>${esc(PROPERTY_TYPE_REGISTRY[p.type].vrsync)}</PropertyType>`,
    `<Description>${esc(corta(p.description ?? '', VRSYNC_DESCRICAO_MAX))}</Description>`,
    priceTag,
    areaTag,
    !semComodos && p.bedrooms ? `<Bedrooms>${p.bedrooms}</Bedrooms>` : '',
    !semComodos && p.bathrooms ? `<Bathrooms>${p.bathrooms}</Bathrooms>` : '',
    !semComodos && p.suites ? `<Suites>${p.suites}</Suites>` : '',
    !semComodos && p.parking ? `<Garage type="Parking Space">${p.parking}</Garage>` : '',
    // `Features` fica de fora de propósito: o VRSync só aceita uma lista
    // fechada em inglês ("Pool", "Gym"…), e o diferencial daqui é texto livre
    // ("quintal com churrasqueira"). Mandado cru, vira aviso no relatório de
    // carga e nada aparece no anúncio — o texto já está na descrição.
  ].join('')

  // `displayAddress="Neighborhood"`: o portal recebe rua e CEP (sem eles o
  // anúncio é recusado) mas mostra só o bairro. É o mesmo nível de detalhe
  // que o site da imobiliária publica.
  const location =
    `<Location displayAddress="Neighborhood">` +
    `<Country abbreviation="BR">Brasil</Country>` +
    `<State abbreviation="${esc(stateAbbr)}">${esc(stateName)}</State>` +
    `<City>${esc(p.city)}</City>` +
    `<Neighborhood>${esc(p.neighborhood)}</Neighborhood>` +
    `<Address>${esc(p.addressStreet)}</Address>` +
    (p.addressNumber?.trim() ? `<StreetNumber>${esc(p.addressNumber.trim())}</StreetNumber>` : '') +
    `<PostalCode>${esc(onlyDigits(p.addressZip))}</PostalCode>` +
    `</Location>`

  const media = `<Media>${images
    .map(
      (img) =>
        `<Item medium="image"${img.isCover ? ' primary="true"' : ''}` +
        `${img.alt ? ` caption="${esc(img.alt)}"` : ''}>${esc(img.url)}</Item>`,
    )
    .join('')}</Media>`

  const contactTag = [
    contato.name ? `<Name>${esc(contato.name)}</Name>` : '',
    contato.email ? `<Email>${esc(contato.email)}</Email>` : '',
    contato.phone ? `<Telephone>${esc(contato.phone)}</Telephone>` : '',
  ].join('')

  return (
    `<Listing>` +
    `<ListingID>${esc(p.code)}</ListingID>` +
    `<Title>${esc(corta(p.title, VRSYNC_TITULO_MAX))}</Title>` +
    `<TransactionType>${isRent ? 'For Rent' : 'For Sale'}</TransactionType>` +
    `<ListDate>${new Date(p.createdAt).toISOString()}</ListDate>` +
    `<LastUpdateDate>${new Date(p.updatedAt).toISOString()}</LastUpdateDate>` +
    `<DetailViewUrl>${esc(origin + propertyPath(p))}</DetailViewUrl>` +
    media +
    `<Details>${details}</Details>` +
    location +
    (contactTag ? `<ContactInfo>${contactTag}</ContactInfo>` : '') +
    `</Listing>`
  )
}

/**
 * O feed completo. Imóvel com pendência fica FORA: mandá-lo só produziria um
 * erro no relatório do Canal Pro, que ninguém lê, em vez do aviso no painel,
 * que diz o que preencher.
 */
export function buildVrsyncFeed(args: {
  providerName: string
  contato: VrsyncContato
  properties: Property[]
  origin: string
  agora?: Date
}): { xml: string; incluidos: number; excluidos: number } {
  const { providerName, contato, properties, origin } = args
  const prontos = properties.filter((p) => pendenciasVrsync(p).length === 0)
  const listings = prontos.map((p) => listingXml(p, contato, origin)).join('')

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<ListingDataFeed xmlns="http://www.vivareal.com/schemas/1.0/VRSync" ` +
    `xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ` +
    `xsi:schemaLocation="http://www.vivareal.com/schemas/1.0/VRSync http://xml.vivareal.com/vrsync.xsd">\n` +
    `<Header>` +
    `<Provider>${esc(providerName)}</Provider>` +
    (contato.email ? `<Email>${esc(contato.email)}</Email>` : '') +
    (contato.name ? `<ContactName>${esc(contato.name)}</ContactName>` : '') +
    `<PublishDate>${(args.agora ?? new Date()).toISOString()}</PublishDate>` +
    (contato.phone ? `<Telephone>${esc(contato.phone)}</Telephone>` : '') +
    `</Header>\n` +
    `<Listings>${listings}</Listings>\n` +
    `</ListingDataFeed>\n`

  return { xml, incluidos: prontos.length, excluidos: properties.length - prontos.length }
}
