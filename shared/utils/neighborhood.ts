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

/** Conectivos que ficam em minúscula no meio do nome ("Bela Vista da Lagoa"). */
const CONECTIVOS = new Set(['da', 'das', 'de', 'do', 'dos', 'e'])
const ROMANO = /^(i{1,3}|iv|v|vi{1,3}|ix|x)$/i

/**
 * Grafia de EXIBIÇÃO de um bairro: "Bela vista da lagoa " -> "Bela Vista da
 * Lagoa", "JARDIM ALVORADA" -> "Jardim Alvorada", "Jardim dos Ipês ii" ->
 * "Jardim dos Ipês II".
 *
 * O acervo tem a mesma rua digitada de vários jeitos, e o site mostrava cada
 * um como veio: dois cards lado a lado com "Mais Parque" e "Mais parque"
 * parecem site descuidado, não cadastro manual. Normalizar o banco seria
 * migration sobre texto do cliente; aqui só a TELA pública se alinha, e o
 * painel continua vendo exatamente o que foi gravado.
 *
 * O que NÃO dá para consertar aqui: acento que não foi digitado ("Tres").
 * Para os rótulos de grupo, `qualifyingNeighborhoods` escolhe a variante
 * acentuada quando existe uma.
 *
 * Sigla curta toda em maiúscula ("JK", "BNH") fica como está — "Jk" seria pior
 * que o original.
 */
export function displayNeighborhood(raw: string | null | undefined): string {
  const limpo = (raw || '').trim().replace(/\s+/g, ' ')
  if (!limpo) return ''
  return limpo
    .split(' ')
    .map((palavra, i) => {
      const lower = palavra.toLocaleLowerCase('pt-BR')
      if (i > 0 && CONECTIVOS.has(lower)) return lower
      if (ROMANO.test(palavra)) return palavra.toUpperCase()
      if (palavra.length <= 3 && palavra === palavra.toUpperCase() && /[A-Z]/.test(palavra)) return palavra
      // Palavra com ponto ("V.L") é abreviação: mexer quebraria a leitura.
      if (palavra.includes('.')) return palavra
      return lower.charAt(0).toLocaleUpperCase('pt-BR') + lower.slice(1)
    })
    .join(' ')
}

/** Quantos caracteres acentuados — desempate para escolher a grafia do grupo. */
function acentos(s: string): number {
  return (s.normalize('NFD').match(/[\u0300-\u036f]/g) || []).length
}

interface Grupo {
  count: number
  /** Grafias cruas vistas, com quantas vezes cada uma aparece. */
  variantes: Map<string, number>
}

function groupByNeighborhood(items: { neighborhood?: string | null }[]): Map<string, Grupo> {
  const grupos = new Map<string, Grupo>()
  for (const item of items) {
    const slug = item.neighborhood ? slugify(item.neighborhood) : ''
    if (!slug) continue
    const g = grupos.get(slug) ?? { count: 0, variantes: new Map() }
    g.count++
    const v = displayNeighborhood(item.neighborhood)
    g.variantes.set(v, (g.variantes.get(v) ?? 0) + 1)
    grupos.set(slug, g)
  }
  return grupos
}

/**
 * Rótulo do grupo a partir das grafias REAIS, não do slug.
 *
 * Derivar do slug perdia acento e capitalizava conectivo: "Nova Três Lagoas"
 * virava "Nova Tres Lagoas", "Bela Vista da Lagoa" virava "Bela Vista Da
 * Lagoa" — justamente no link de bairro da home. Agora vence a variante com
 * mais acentos (quem acentuou digitou com mais cuidado) e, no empate, a mais
 * usada.
 */
function labelFromGroup(g: Grupo): string {
  return [...g.variantes].sort((a, b) => acentos(b[0]) - acentos(a[0]) || b[1] - a[1])[0]![0]
}

/**
 * Bairros com imóveis suficientes para virar página indexada — mesmo piso de
 * `CATEGORY_MIN_PROPERTIES` usado pelas categorias de tipo/pretensão, para não
 * publicar dezenas de páginas quase vazias.
 */
export function qualifyingNeighborhoods(items: { neighborhood?: string | null }[]): NeighborhoodGroup[] {
  return [...groupByNeighborhood(items)]
    .filter(([, g]) => g.count >= CATEGORY_MIN_PROPERTIES)
    .map(([slug, g]) => ({ slug, label: labelFromGroup(g), count: g.count }))
    .sort((a, b) => b.count - a.count)
}

/**
 * Todos os bairros de uma lista, agrupados como nas páginas de bairro — sem o
 * piso de conteúdo. Serve os atalhos da página de categoria, onde "Bela Vista
 * da Lagoa" e "Bela vista da Lagoa" apareciam como DUAS pastilhas.
 */
export function allNeighborhoods(items: { neighborhood?: string | null }[]): NeighborhoodGroup[] {
  return [...groupByNeighborhood(items)]
    .map(([slug, g]) => ({ slug, label: labelFromGroup(g), count: g.count }))
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
