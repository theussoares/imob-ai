import { PROPERTY_TYPES, type PropertyPurpose, type PropertyType } from '../models/property'

/**
 * Filtros da busca da home <-> query string.
 *
 * Antes os filtros viviam só em memória (`useState`): sobreviviam ao "voltar"
 * da SPA, mas não a um reload, e não havia como mandar uma busca para alguém.
 * Justamente o uso mais comum do corretor — "olha essas casas até 350 mil" no
 * WhatsApp — chegava na home sem filtro nenhum.
 *
 * As chaves são em português porque aparecem para quem recebe o link, e os
 * valores padrão NÃO entram: `/?tipo=casa` em vez de uma URL com seis
 * parâmetros, dos quais cinco dizem "qualquer".
 *
 * A home continua com canonical fixo em `/`, então cada combinação de filtro
 * não vira uma página duplicada no índice. A página indexável de uma pretensão
 * ou de um tipo segue sendo `/imoveis/<categoria>`.
 */

export type CatalogSort = 'rel' | 'menor' | 'maior' | 'area'

/** Mesmo formato de `CatalogFilters` (app/composables/useCatalog.ts). */
export interface CatalogQueryFilters {
  purpose: PropertyPurpose
  q: string
  type: '' | PropertyType
  bedrooms: number
  maxPrice: number
  sort: CatalogSort
}

const SORTS: readonly CatalogSort[] = ['rel', 'menor', 'maior', 'area']

/** Quartos vão de 1 a 4 no seletor ("4+"); acima disso é link adulterado. */
const MAX_QUARTOS = 4

type QueryValue = string | null | undefined | (string | null)[]

function primeiro(v: QueryValue): string {
  const s = Array.isArray(v) ? v[0] : v
  return typeof s === 'string' ? s : ''
}

function inteiroPositivo(v: QueryValue): number {
  const s = primeiro(v)
  if (!/^\d+$/.test(s)) return 0
  const n = Number(s)
  return Number.isSafeInteger(n) ? n : 0
}

/**
 * Lê a query e devolve SÓ os filtros que vieram válidos.
 *
 * Link de WhatsApp é colado, cortado e editado à mão: um `tipo=casaa` ou um
 * `quartos=abc` não pode quebrar a página nem virar filtro que zera a lista.
 * Valor inválido é ignorado, como se não tivesse vindo.
 */
export function catalogFiltersFromQuery(
  query: Record<string, QueryValue>,
): Partial<CatalogQueryFilters> {
  const out: Partial<CatalogQueryFilters> = {}

  const finalidade = primeiro(query.finalidade)
  if (finalidade === 'aluguel' || finalidade === 'venda') out.purpose = finalidade

  const q = primeiro(query.q).trim().slice(0, 80)
  if (q) out.q = q

  const tipo = primeiro(query.tipo)
  if ((PROPERTY_TYPES as string[]).includes(tipo)) out.type = tipo as PropertyType

  const quartos = inteiroPositivo(query.quartos)
  if (quartos >= 1 && quartos <= MAX_QUARTOS) out.bedrooms = quartos

  const ate = inteiroPositivo(query.ate)
  if (ate > 0) out.maxPrice = ate

  const ordem = primeiro(query.ordem) as CatalogSort
  if (SORTS.includes(ordem) && ordem !== 'rel') out.sort = ordem

  return out
}

/** Query mínima que reproduz os filtros — só o que difere do padrão. */
export function catalogFiltersToQuery(f: CatalogQueryFilters): Record<string, string> {
  const out: Record<string, string> = {}
  if (f.purpose === 'aluguel') out.finalidade = 'aluguel'
  const q = f.q.trim()
  if (q) out.q = q
  if (f.type) out.tipo = f.type
  if (f.bedrooms) out.quartos = String(f.bedrooms)
  if (f.maxPrice) out.ate = String(f.maxPrice)
  if (f.sort !== 'rel') out.ordem = f.sort
  return out
}

/** Chaves que esta busca controla — o resto da query (utm_*, tenant) fica. */
export const CATALOG_QUERY_KEYS = ['finalidade', 'q', 'tipo', 'quartos', 'ate', 'ordem'] as const
