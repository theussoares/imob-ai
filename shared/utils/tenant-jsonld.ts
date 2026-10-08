import type { Tenant } from '~~/shared/models/tenant'
import { googleMapsLink, hasStructuredAddress, tenantCoordinates } from '~~/shared/utils/address'

type CamposDaImobiliaria = Pick<
  Tenant,
  | 'name'
  | 'alternateNames'
  | 'heroSubtitle'
  | 'phone'
  | 'email'
  | 'city'
  | 'state'
  | 'logoUrl'
  | 'instagram'
  | 'creci'
  | 'addressStreet'
  | 'addressNumber'
  | 'addressZip'
  | 'latitude'
  | 'longitude'
>

/**
 * A imobiliária como `RealEstateAgent` do schema.org.
 *
 * Morava dentro da home. O "Quem somos" precisava da mesma entidade — lá ela ia
 * só com nome e URL, e endereço, telefone e Instagram, que já estavam no
 * cadastro, não chegavam ao resultado local do Google. Duas cópias divergiriam
 * na primeira mudança; por isso uma função só, e o mesmo `@id` (a origem) nas
 * duas páginas, que é como o buscador entende que é a mesma empresa.
 *
 * Sem `@context`: quem chama decide se é documento solto (home) ou nó de um
 * `@graph` (Quem somos).
 */
export function realEstateAgentJsonLd(t: CamposDaImobiliaria, origin: string) {
  const coords = tenantCoordinates(t)
  const sameAs = [t.instagram].filter(Boolean) as string[]
  return {
    '@type': 'RealEstateAgent',
    '@id': origin,
    name: t.name,
    alternateName: t.alternateNames?.length ? t.alternateNames : undefined,
    description: t.heroSubtitle || undefined,
    telephone: t.phone || undefined,
    email: t.email || undefined,
    // `City`, e não a string: é o tipo que o schema.org pede para área de
    // atuação, e deixa o buscador ligar o nome à cidade em vez de ler texto solto.
    areaServed: t.city ? { '@type': 'City', name: t.city } : undefined,
    url: origin,
    logo: t.logoUrl || undefined,
    image: t.logoUrl || undefined,
    sameAs: sameAs.length ? sameAs : undefined,
    // CRECI é o registro que dá legitimidade à imobiliária no Brasil — o
    // primeiro sinal que o comprador procura. `identifier` com `propertyID` é
    // a forma do schema.org para registro profissional.
    identifier: t.creci ? { '@type': 'PropertyValue', propertyID: 'CRECI', value: t.creci } : undefined,
    address: t.city
      ? {
          '@type': 'PostalAddress',
          // Rua/número só entram quando a imobiliária preencheu o endereço
          // estruturado (Meu site → Localização) — cidade/UF sempre existiram e
          // continuam sozinhos servindo quem não configurou nada além disso.
          ...(hasStructuredAddress(t)
            ? {
                streetAddress: [t.addressStreet, t.addressNumber].filter(Boolean).join(', '),
                postalCode: t.addressZip || undefined,
              }
            : {}),
          addressLocality: t.city,
          addressRegion: t.state || undefined,
          addressCountry: 'BR',
        }
      : undefined,
    // Só com coordenadas ou endereço estruturado: link de mapa para "Três Lagoas"
    // apontaria para o centro da cidade, não para a imobiliária.
    hasMap: coords || hasStructuredAddress(t) ? (googleMapsLink(t) ?? undefined) : undefined,
    geo: coords ? { '@type': 'GeoCoordinates', latitude: coords.lat, longitude: coords.lng } : undefined,
  }
}
