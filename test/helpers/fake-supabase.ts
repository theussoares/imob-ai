interface QueryResult {
  data: unknown
  error: unknown
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
export function fakeSupabase(results: Record<string, QueryResult | QueryResult[]>) {
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
    const methods = ['select', 'update', 'insert', 'delete', 'eq', 'in', 'order', 'limit', 'maybeSingle', 'single']
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { client: { from } as any, calls }
}

export interface FakeAuthUser {
  id: string
  email: string
  email_confirmed_at?: string | null
}

/**
 * Igual ao `fakeSupabase`, mais o `auth.admin` que o convite usa.
 *
 * `generateLink` recusa e-mail já cadastrado, do mesmo jeito que o GoTrue —
 * é justamente esse caminho que o código precisa tratar sem parecer erro.
 */
export function fakeSupabaseWithAuth(opts: {
  results?: Record<string, QueryResult | QueryResult[]>
  users?: FakeAuthUser[]
  link?: string
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
