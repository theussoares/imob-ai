import type { Property } from '~~/shared/models/property'
import { PROPERTY_TYPE_LABELS, PROPERTY_TYPE_REGISTRY, temQuartos } from '~~/shared/models/property'

/**
 * JSON-LD do imóvel — o que o robô de busca lê da página de detalhe.
 *
 * Vive em `shared/` e não dentro da página por um motivo só: aqui existe
 * teste. Este objeto é um payload PÚBLICO montado a partir do modelo completo
 * de `Property`, que carrega os campos internos (`location`, `ownerName`,
 * `ownerPhone`, `brokerId`, `updatedBy`) quando a leitura vem do painel.
 * Espalhar `p.` dentro de um `computed` de componente é exatamente como
 * `updated_by` vazou para o JSON público uma vez — e lá o mapper passou a
 * barrar, mas um objeto montado à mão no template não passa por mapper nenhum.
 *
 * O teste ao lado varre o JSON serializado atrás desses campos. Campo interno
 * novo em `Property` deve entrar na lista de lá também.
 */
export interface PropertyJsonLdContext {
  /** Nome da imobiliária, para `brand`. */
  tenantName?: string | null
  /** URL canônica da página — vai em `offers.url`. */
  canonical: string
}

/** Endereço público: cidade e UF, nada mais. */
export function publicAddress(p: Pick<Property, 'city' | 'state'>) {
  const cidade = (p.city || '').trim()
  const uf = (p.state || '').trim()
  if (!cidade && !uf) return undefined
  return {
    '@type': 'PostalAddress',
    addressCountry: 'BR',
    ...(cidade ? { addressLocality: cidade } : {}),
    ...(uf ? { addressRegion: uf } : {}),
  }
}

export function propertyJsonLd(p: Property, ctx: PropertyJsonLdContext) {
  const schemaType = PROPERTY_TYPE_REGISTRY[p.type].schema

  return {
    '@context': 'https://schema.org',
    // Dois tipos de propósito. `Product` é o que sustenta `offers` (preço,
    // moeda, disponibilidade); o tipo do registro (House, Apartment, Place) é
    // o que sustenta endereço, quartos e área. Sem o par, essas propriedades
    // ficariam penduradas num Product, onde não são válidas — que era o estado
    // anterior, e o motivo de elas simplesmente não existirem no JSON-LD.
    '@type': ['Product', schemaType],
    name: p.title,
    sku: p.code,
    category: PROPERTY_TYPE_LABELS[p.type],
    description: p.description || undefined,
    image: p.images.map((i) => i.url),
    brand: { '@type': 'Brand', name: ctx.tenantName || undefined },
    offers: {
      '@type': 'Offer',
      price: p.price,
      priceCurrency: 'BRL',
      availability: 'https://schema.org/InStock',
      url: ctx.canonical,
      businessFunction:
        p.purpose === 'aluguel'
          ? 'http://purl.org/goodrelations/v1#LeaseOut'
          : 'http://purl.org/goodrelations/v1#Sell',
    },
    address: publicAddress(p),
    /**
     * Quartos e área só quando o tipo os tem de verdade.
     *
     * `numberOfRooms`/`floorSize` existem em House e Apartment, não em Place —
     * e Place é o schema de terreno, sala, salão e prédio. `temQuartos` já é a
     * pergunta certa: ele existe porque o código todo queria saber se há
     * quarto para anunciar, não qual era o tipo. Emitir área num Place seria
     * inventar propriedade fora do vocabulário — o mesmo erro que o campo
     * `vrsync`, ao lado no registro, ensina a não cometer com o portal.
     */
    ...(temQuartos(p.type)
      ? {
          numberOfRooms: p.bedrooms || undefined,
          floorSize: p.area
            ? { '@type': 'QuantitativeValue', value: p.area, unitCode: 'MTK' }
            : undefined,
        }
      : {}),
  }
}
