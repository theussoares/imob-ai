interface QueryResult {
  data: unknown
  error: unknown
  // Opcional: só quem simula `.select(..., { count: 'exact', head: true })`
  // (contagem sem linhas) precisa dele. Ausente, fica `undefined`, igual ao
  // Supabase real quando a query não pede contagem.
  count?: number
}

export interface RecordedCall {
  table: string
  method: string
  args: unknown[]
}

/**
 * Client de Supabase falso, só o suficiente para os repositórios.
 *
 * O builder do PostgREST é encadeável e "thenable" — `.from().update().eq()`
 * devolve algo que dá para dar `await`. O fake imita isso e registra a cadeia,
 * o que permite afirmar sobre o que foi enviado (ex.: se o update levou a
 * condição de versão) e sobre o que NÃO foi tocado.
 *
 * `results` aceita uma lista por tabela quando a mesma tabela é consultada mais
 * de uma vez na sequência (o update e a releitura do imóvel, por exemplo).
 */
export function fakeSupabase(
  results: Record<string, QueryResult | QueryResult[]>,
  // Segundo argumento OPCIONAL: os ~70 usos existentes continuam válidos sem
  // tocar em nenhum deles.
  rpcResults: Record<string, QueryResult | QueryResult[]> = {},
) {
  const calls: RecordedCall[] = []
  const consumed: Record<string, number> = {}

  function next(table: string): QueryResult {
    const r = results[table]
    if (!r) return { data: null, error: null }
    if (!Array.isArray(r)) return r
    const i = consumed[table] ?? 0
    consumed[table] = i + 1
    return r[i] ?? { data: null, error: null }
  }

  function from(table: string) {
    const chain: Record<string, unknown> = {}
    // `gte` entra aqui porque `contarNoMes` (ai-generation.repository) e
    // `assertSubmitRateLimit` (rate-limit) encadeiam ambos `.eq(...).gte(...)`
    // — sem o método a cadeia quebra em runtime com "gte is not a function",
    // só visível ao escrever o primeiro teste que exercita esse caminho.
    const methods = ['select', 'update', 'upsert', 'insert', 'delete', 'eq', 'gte', 'not', 'in', 'ilike', 'order', 'limit', 'is', 'maybeSingle', 'single']
    for (const m of methods) {
      chain[m] = (...args: unknown[]) => {
        calls.push({ table, method: m, args })
        return chain
      }
    }
    chain.then = (ok: (v: QueryResult) => unknown, err?: (e: unknown) => unknown) =>
      Promise.resolve(next(table)).then(ok, err)
    return chain
  }

  // `rpc` não é encadeável como o `from`: devolve a promessa direto. Registrado
  // como `rpc:<nome>` para o teste afirmar sobre os argumentos enviados — que é
  // onde mora o tenant, e o tenant é o que o advisory lock usa.
  function rpc(name: string, args: unknown) {
    calls.push({ table: `rpc:${name}`, method: 'rpc', args: [args] })
    const r = rpcResults[name]
    if (!r) return Promise.resolve({ data: null, error: null })
    if (!Array.isArray(r)) return Promise.resolve(r)
    const i = consumed[`rpc:${name}`] ?? 0
    consumed[`rpc:${name}`] = i + 1
    return Promise.resolve(r[i] ?? { data: null, error: null })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { client: { from, rpc } as any, calls }
}

export interface FakeAuthUser {
  id: string
  email: string
  email_confirmed_at?: string | null
}

/**
 * Igual ao `fakeSupabase`, mais o `auth.admin` que o convite usa.
 *
 * `generateLink` imita o GoTrue nos dois tipos, e a diferença entre eles é o que
 * dá sentido ao teste:
 *   - `invite` RECUSA e-mail já cadastrado (é esse erro que o código usa para
 *     distinguir conta nova de conta preexistente);
 *   - `recovery` ACEITA e-mail cadastrado e devolve o link — é o token que não
 *     pode ser emitido para a conta de um terceiro.
 */
export function fakeSupabaseWithAuth(opts: {
  results?: Record<string, QueryResult | QueryResult[]>
  users?: FakeAuthUser[]
  link?: string
  /** Link devolvido por `generateLink({type:'recovery'})`. */
  linkRecovery?: string
}) {
  const { client, calls } = fakeSupabase(opts.results ?? {})
  const users = opts.users ?? []
  const authCalls: { method: string; args: unknown[] }[] = []

  client.auth = {
    admin: {
      listUsers: async () => {
        authCalls.push({ method: 'listUsers', args: [] })
        return { data: { users }, error: null }
      },
      generateLink: async (params: { type: string; email: string }) => {
        authCalls.push({ method: 'generateLink', args: [params] })
        const existing = users.find((u) => u.email === params.email)

        if (params.type === 'recovery') {
          // Recuperação é para conta que existe; para e-mail desconhecido o
          // GoTrue não tem o que recuperar.
          return existing
            ? {
                data: {
                  user: existing,
                  properties: { action_link: opts.linkRecovery ?? 'https://exemplo/recovery' },
                },
                error: null,
              }
            : { data: { user: null, properties: null }, error: { message: 'User not found' } }
        }

        if (existing) {
          return { data: { user: null, properties: null }, error: { message: 'User already registered' } }
        }
        const user: FakeAuthUser = { id: 'novo-user', email: params.email, email_confirmed_at: null }
        users.push(user)
        return {
          data: { user, properties: { action_link: opts.link ?? 'https://exemplo/convite' } },
          error: null,
        }
      },
    },
  }

  return { client, calls, authCalls, users }
}

/** A cadeia enviada para uma tabela incluiu `.eq(coluna, valor)`? */
export function hadEq(calls: RecordedCall[], table: string, column: string): boolean {
  return calls.some((c) => c.table === table && c.method === 'eq' && c.args[0] === column)
}

/** Alguma coisa foi enviada para esta tabela? */
export function touched(calls: RecordedCall[], table: string): boolean {
  return calls.some((c) => c.table === table)
}
