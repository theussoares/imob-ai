import type { PropertyType, PropertyPurpose } from '~~/shared/models/property'
import { PROPERTY_TYPES } from '~~/shared/models/property'

/**
 * Categorias do catálogo: /imoveis/casas-a-venda, /imoveis/apartamentos-para-alugar.
 *
 * O slug é legível de propósito — casa com a busca real de quem procura ("casas à
 * venda em Três Lagoas") melhor do que uma estrutura tipo /imoveis/venda/casa.
 *
 * Vive em shared/ porque a página e o sitemap precisam do mesmo mapeamento: se
 * divergirem, o sitemap publica URL que dá 404.
 */

/** Mínimo de imóveis para a categoria virar página indexada. */
export const CATEGORY_MIN_PROPERTIES = 3

const TYPE_SLUGS: Record<PropertyType, string> = {
  casa: 'casas',
  apartamento: 'apartamentos',
  sobrado: 'sobrados',
  terreno: 'terrenos',
}

const PURPOSE_SLUGS: Record<PropertyPurpose, string> = {
  venda: 'a-venda',
  aluguel: 'para-alugar',
}

const TYPE_PLURAL: Record<PropertyType, string> = {
  casa: 'Casas',
  apartamento: 'Apartamentos',
  sobrado: 'Sobrados',
  terreno: 'Terrenos',
}

const PURPOSE_LABEL: Record<PropertyPurpose, string> = {
  venda: 'à venda',
  aluguel: 'para alugar',
}

export interface PropertyCategory {
  type: PropertyType
  purpose: PropertyPurpose
}

export function categorySlug(c: PropertyCategory): string {
  return `${TYPE_SLUGS[c.type]}-${PURPOSE_SLUGS[c.purpose]}`
}

/** "Casas à venda" — usado no h1, no title e no breadcrumb. */
export function categoryLabel(c: PropertyCategory): string {
  return `${TYPE_PLURAL[c.type]} ${PURPOSE_LABEL[c.purpose]}`
}

/** Slug -> categoria. null quando não corresponde a nenhuma combinação válida. */
export function parseCategorySlug(slug: string): PropertyCategory | null {
  for (const type of PROPERTY_TYPES) {
    for (const purpose of ['venda', 'aluguel'] as PropertyPurpose[]) {
      if (categorySlug({ type, purpose }) === slug) return { type, purpose }
    }
  }
  return null
}

/** Todas as combinações possíveis (8). Nem todas viram página — ver o piso acima. */
export function allCategories(): PropertyCategory[] {
  const out: PropertyCategory[] = []
  for (const type of PROPERTY_TYPES) {
    for (const purpose of ['venda', 'aluguel'] as PropertyPurpose[]) {
      out.push({ type, purpose })
    }
  }
  return out
}

/**
 * Categorias que têm imóveis suficientes para virar página.
 *
 * O piso existe porque gerar toda combinação produziria, com o inventário real,
 * ~20 rotas das quais 17 teriam zero ou um imóvel. Página fina em massa é tratada
 * como spam e prejudica o site inteiro, não só as páginas fracas.
 */
export function qualifyingCategories(
  items: { type: PropertyType; purpose: PropertyPurpose }[],
): PropertyCategory[] {
  return allCategories().filter(
    (c) =>
      items.filter((i) => i.type === c.type && i.purpose === c.purpose).length >=
      CATEGORY_MIN_PROPERTIES,
  )
}
