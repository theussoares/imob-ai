import type { PropertyType, PropertyPurpose } from '~~/shared/models/property'
import { PROPERTY_TYPES, PROPERTY_TYPE_REGISTRY } from '~~/shared/models/property'

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


const PURPOSE_SLUGS: Record<PropertyPurpose, string> = {
  venda: 'a-venda',
  aluguel: 'para-alugar',
}


const PURPOSE_LABEL: Record<PropertyPurpose, string> = {
  venda: 'à venda',
  aluguel: 'para alugar',
}

export interface PropertyCategory {
  /** `null` = todos os tipos: /imoveis/a-venda e /imoveis/para-alugar. */
  type: PropertyType | null
  purpose: PropertyPurpose
}

export function categorySlug(c: PropertyCategory): string {
  const pretensao = PURPOSE_SLUGS[c.purpose]
  return c.type ? `${PROPERTY_TYPE_REGISTRY[c.type].slug}-${pretensao}` : pretensao
}

/** "Casas à venda" / "Imóveis à venda" — usado no h1, no title e no breadcrumb. */
export function categoryLabel(c: PropertyCategory): string {
  const plural = c.type ? PROPERTY_TYPE_REGISTRY[c.type].plural : 'Imóveis'
  return `${plural} ${PURPOSE_LABEL[c.purpose]}`
}

/** Slug -> categoria. null quando não corresponde a nenhuma combinação válida. */
export function parseCategorySlug(slug: string): PropertyCategory | null {
  for (const c of allCategories()) {
    if (categorySlug(c) === slug) return c
  }
  return null
}

/** Todas as combinações: 8 de tipo + 2 só de pretensão. */
export function allCategories(): PropertyCategory[] {
  const out: PropertyCategory[] = []
  for (const purpose of ['venda', 'aluguel'] as PropertyPurpose[]) {
    out.push({ type: null, purpose })
    for (const type of PROPERTY_TYPES) out.push({ type, purpose })
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
      items.filter((i) => i.purpose === c.purpose && (c.type === null || i.type === c.type))
        .length >= CATEGORY_MIN_PROPERTIES,
  )
}
