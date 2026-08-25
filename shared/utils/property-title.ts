import type { PropertyType, PropertyPurpose } from '~~/shared/models/property'
import { PROPERTY_TYPE_LABELS } from '~~/shared/models/property'

/**
 * Título da página de detalhe para a busca.
 *
 * Não usa `property.title`: aquele campo é escrito pela imobiliária para uso
 * interno, e em produção rende "Terreno · Terreno" e "J.D-Alvorada". O texto
 * dela continua no <h1> e no card — só o metadado é composto.
 *
 * A medida é quartos para imóvel construído e área para terreno. Não é
 * preciosismo: sem a área, dois terrenos do mesmo bairro geram títulos
 * idênticos, o que troca um problema de SEO por outro.
 */
export interface PropertyTitleFields {
  type: PropertyType
  purpose: PropertyPurpose
  bedrooms: number
  area: number
  neighborhood?: string | null
  city?: string | null
}

/** Tira espaço das pontas e colapsa o do meio (o cadastro tem "Vila piloto "). */
function limpar(v?: string | null): string {
  return (v || '').trim().replace(/\s+/g, ' ')
}

export function propertyTitle(p: PropertyTitleFields): string {
  const medida =
    p.type === 'terreno'
      ? p.area
        ? `${Math.round(p.area)}m²`
        : ''
      : p.bedrooms
        ? `${p.bedrooms} quarto${p.bedrooms > 1 ? 's' : ''}`
        : ''

  const pretensao = p.purpose === 'aluguel' ? 'para alugar' : 'à venda'
  const bairro = limpar(p.neighborhood)
  const cidade = limpar(p.city)

  return (
    [PROPERTY_TYPE_LABELS[p.type], medida, pretensao].filter(Boolean).join(' ') +
    (bairro ? ` no ${bairro}` : '') +
    (cidade ? `, ${cidade}` : '')
  )
}
