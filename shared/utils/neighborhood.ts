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

/**
 * A grafia canônica de um bairro dentro da imobiliária.
 *
 * O agrupamento por `slugify` (acima) já une "Mais Parque", "Mais parque " e
 * "Mais Parque " numa página só — mas o valor CRU continua no banco, e é ele
 * que aparece no título, no card e na URL do imóvel. Em produção, "Bela Vista
 * da Lagoa" existia como SEIS strings diferentes na mesma imobiliária.
 *
 * Aqui o cadastro novo se alinha ao que já existe: se o que foi digitado se lê
 * como um bairro já cadastrado, grava-se a grafia dele. Assim o acervo converge
 * sozinho, sem ninguém corrigir nada à mão.
 *
 * O que esta função NÃO resolve, de propósito: "Jardim dos Ipês 2" e "Jardim
 * dos Ipes3" se leem diferente de "Jardim dos Ipês" e continuam bairros
 * distintos. Adivinhar que são o mesmo lugar juntaria bairros que de fato
 * existem separados — quem evita esse caso é a lista de sugestões do
 * formulário, não o servidor.
 */
export function canonicalNeighborhood(
  input: string | null | undefined,
  existentes: string[],
): string | null {
  // Espaço na ponta e no meio some sempre: é digitação, nunca intenção. Em
  // produção há "Vila piloto " e "V.L DE Leon" cadastrados assim.
  const limpo = (input || '').trim().replace(/\s+/g, ' ')
  if (!limpo) return null

  const alvo = slugify(limpo)
  if (!alvo) return limpo

  // A primeira grafia já cadastrada que se lê igual. Empate não importa: o que
  // vale é convergir para UMA delas, e a ordem vem do banco, estável.
  const existente = existentes.find((e) => slugify(e) === alvo)
  return existente ? existente.trim().replace(/\s+/g, ' ') : limpo
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
