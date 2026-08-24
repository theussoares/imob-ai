/**
 * Colapsa requisições IDÊNTICAS E SIMULTÂNEAS numa execução só.
 *
 * É dedupe, não cache: a entrada morre assim que a promise termina, então duas
 * chamadas em sequência fazem duas requisições. A diferença importa — cache aqui
 * faria a tela mostrar dado velho sem ter pedido isso.
 */
const emVoo = new Map<string, Promise<unknown>>()

/** É `{}` ou `[]` puro? Instância de classe (FormData, Blob…) não é. */
function simples(v: object): boolean {
  if (Array.isArray(v)) return true
  const proto = Object.getPrototypeOf(v)
  return proto === Object.prototype || proto === null
}

/**
 * Serializa um valor para compor a chave, com ordem de chaves estável.
 *
 * Não use `JSON.stringify(obj, chaves)` no lugar disto: ali o array vira
 * REPLACER e filtra as chaves em profundidade, então `{query:{page:2}}` sai como
 * `{"query":{}}` — e requisições diferentes passariam a colidir na mesma chave.
 *
 * O que não dá para comparar (FormData, Blob, Date…) recebe valor único: sem
 * prova de igualdade, o certo é NÃO deduplicar.
 */
export function stableKeyPart(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (!simples(value)) return `~naocomparavel:${++contador}`
  if (Array.isArray(value)) return `[${value.map(stableKeyPart).join(',')}]`

  const obj = value as Record<string, unknown>
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableKeyPart(obj[k])}`)
    .join(',')}}`
}
let contador = 0

export function dedupeInflight<T>(key: string, run: () => Promise<T>): Promise<T> {
  const pendente = emVoo.get(key) as Promise<T> | undefined
  if (pendente) return pendente

  // O `finally` limpa nos dois caminhos: se ficasse presa numa rejeição, um erro
  // transitório congelaria aquela chamada para sempre.
  const req = run().finally(() => {
    // Só remove se ainda for a MESMA promise: um `clearInflight` no meio do
    // caminho pode já ter dado a chave para uma requisição mais nova, e apagá-la
    // aqui deixaria a nova sem dedupe.
    if (emVoo.get(key) === req) emVoo.delete(key)
  })

  emVoo.set(key, req)
  return req
}

/**
 * Esquece tudo que está em voo.
 *
 * Serve para depois de uma escrita: se um GET começou ANTES da mutação e ainda
 * não voltou, quem pedir a mesma URL depois dela não pode receber aquela
 * resposta — ela retrata o estado anterior. As chamadas que já esperavam a
 * promise antiga continuam recebendo o que pediram; só a chave é liberada, para
 * que a próxima leitura vá buscar de novo.
 */
export function clearInflight(): void {
  emVoo.clear()
}
