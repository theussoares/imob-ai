import { slugify } from './property-url'
import { CATEGORY_MIN_PROPERTIES } from './category'

/**
 * Páginas de bairro: /imoveis/bairro/mais-parque.
 *
 * `neighborhood` é texto livre digitado no cadastro do imóvel — "Mais Parque",
 * "Mais parque " e "Mais Parque " (variações de maiúscula/espaço do MESMO
 * bairro, comuns em cadastro manual) são valores diferentes. Agrupar pelo
 * valor cru fragmentaria um bairro com conteúdo suficiente em várias páginas
 * finas — o oposto do que ajuda o SEO. `slugify` (o mesmo normalizador da URL
 * do imóvel) é a chave de agrupamento: união por como o nome se lê, não por
 * como foi digitado.
 */

export interface NeighborhoodGroup {
  slug: string
  label: string
  count: number
}

/** "mais-parque" -> "Mais Parque". Deriva do slug — não da grafia de um cadastro
 *  específico — pra dar um rótulo estável mesmo com várias variações do mesmo bairro. */
function labelFromSlug(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function groupByNeighborhood(items: { neighborhood?: string | null }[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const item of items) {
    const slug = item.neighborhood ? slugify(item.neighborhood) : ''
    if (!slug) continue
    counts.set(slug, (counts.get(slug) ?? 0) + 1)
  }
  return counts
}

/**
 * Bairros com imóveis suficientes para virar página indexada — mesmo piso de
 * `CATEGORY_MIN_PROPERTIES` usado pelas categorias de tipo/pretensão, para não
 * publicar dezenas de páginas quase vazias.
 */
export function qualifyingNeighborhoods(items: { neighborhood?: string | null }[]): NeighborhoodGroup[] {
  return [...groupByNeighborhood(items)]
    .filter(([, count]) => count >= CATEGORY_MIN_PROPERTIES)
    .map(([slug, count]) => ({ slug, label: labelFromSlug(slug), count }))
    .sort((a, b) => b.count - a.count)
}

/** slug -> grupo (já com o piso de conteúdo aplicado), ou null. Resolve a rota da página de bairro. */
export function findNeighborhood(items: { neighborhood?: string | null }[], slug: string): NeighborhoodGroup | null {
  return qualifyingNeighborhoods(items).find((g) => g.slug === slug) ?? null
}

/** Imóveis de um bairro (por slug normalizado), destaques primeiro — mesma ordem padrão do catálogo. */
export function propertiesInNeighborhood<T extends { neighborhood?: string | null; featured: boolean }>(
  items: T[],
  slug: string,
): T[] {
  return items
    .filter((p) => p.neighborhood && slugify(p.neighborhood) === slug)
    .sort((a, b) => Number(b.featured) - Number(a.featured))
}
