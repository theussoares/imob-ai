/**
 * Filtros de texto de uma lista do painel <-> query string.
 *
 * Os filtros das listas eram `reactive` local: abrir um imóvel para editar e
 * voltar zerava busca e filtros, e a pessoa refazia a mesma busca a cada
 * item de uma revisão em lote ("todos os aluguéis do corretor X"). Na URL,
 * o "voltar" devolve a lista como estava, e o link filtrado pode ser mandado
 * para um colega.
 *
 * Genérico e só para strings de propósito: é o formato de todos os filtros do
 * painel hoje (select com "" = todos). Valor fora da lista permitida é
 * descartado por quem conhece a lista — ver `allowed`.
 */

type QueryValue = string | null | undefined | (string | null)[]

function first(v: QueryValue): string {
  const s = Array.isArray(v) ? v[0] : v
  return typeof s === 'string' ? s : ''
}

/**
 * Lê da query só as chaves conhecidas. `allowed` restringe uma chave a uma
 * lista fechada (tipo, status...): link editado à mão com valor inexistente
 * vira "todos", e não um filtro que esvazia a tela sem explicação.
 */
export function readListQuery<K extends string>(
  query: Record<string, QueryValue>,
  keys: readonly K[],
  allowed: Partial<Record<K, readonly string[]>> = {},
): Partial<Record<K, string>> {
  const out: Partial<Record<K, string>> = {}
  for (const k of keys) {
    const v = first(query[k]).trim().slice(0, 100)
    if (!v) continue
    const lista = allowed[k]
    if (lista && !lista.includes(v)) continue
    out[k] = v
  }
  return out
}

/** Só o que está preenchido vai para a URL. */
export function writeListQuery<K extends string>(
  values: Record<K, string>,
  keys: readonly K[],
): Partial<Record<K, string>> {
  const out: Partial<Record<K, string>> = {}
  for (const k of keys) {
    const v = values[k]?.trim()
    if (v) out[k] = v
  }
  return out
}
