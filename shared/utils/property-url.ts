import type { PropertyType } from '~~/shared/models/property'

/**
 * URL pública do imóvel: /{slug-descritivo}/{codigo}.
 *
 * O primeiro segmento é decorativo — derivado de tipo/quartos/bairro, ele muda
 * quando o imóvel é editado. O segundo é a chave e é o único que a resolução
 * consulta, então editar o cadastro não quebra link: redireciona.
 *
 * Vive em shared/ porque o card, o canonical, o sitemap, o feed XML e o
 * markdown para agentes precisam produzir exatamente a mesma string. Quando
 * isso era montado à mão em oito lugares, divergir era questão de tempo.
 */
export interface PropertyUrlFields {
  type: PropertyType
  bedrooms: number
  neighborhood?: string | null
  code: string
}

/** Texto livre -> segmento de URL: sem acento, minúsculo, hífen entre palavras. */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Segmento descritivo. Trecho ausente some inteiro, sem deixar hífen duplo. */
export function propertySlug(p: PropertyUrlFields): string {
  // Terreno não tem quartos; imóvel construído com 0 também não deve anunciar.
  const quartos = p.type !== 'terreno' && p.bedrooms > 0 ? `${p.bedrooms}-quartos` : ''
  return [p.type, quartos, p.neighborhood ? slugify(p.neighborhood) : ''].filter(Boolean).join('-')
}

/** Caminho completo. O código vai cru: é a chave que a consulta usa. */
export function propertyPath(p: PropertyUrlFields): string {
  return `/${propertySlug(p)}/${encodeURIComponent(p.code)}`
}
