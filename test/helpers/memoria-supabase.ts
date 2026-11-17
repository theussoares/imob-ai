import { randomUUID } from 'node:crypto'

type Row = Record<string, unknown>

export interface ConsultaGravada {
  table: string
  op: 'select' | 'insert' | 'update' | 'delete'
  /** pares coluna=valor dos `.eq(...)`, para o teste afirmar o escopo de tenant. */
  eq: Record<string, unknown>
}

/**
 * Supabase em memória, só o que o repository de documentos usa: `eq`, `not`,
 * `is`, `in`, `order`, `limit`, `select` (com projeção de colunas), `insert`,
 * `update`, `delete`, `maybeSingle`, `single`.
 *
 * Existe, além do `fakeSupabase` (que devolve respostas roteirizadas), porque
 * aqui o que se testa é ISOLAMENTO: o teste precisa que a query de verdade
 * filtre por tenant e por corretor, senão ele passa mesmo sem o `where`. A
 * projeção de colunas também vale: um `select` sem `storage_path` não devolve
 * `storage_path`, como o PostgREST.
 */
export function memoriaSupabase(inicial: Record<string, Row[]> = {}) {
  const tabelas: Record<string, Row[]> = Object.fromEntries(Object.entries(inicial).map(([k, v]) => [k, v.map((r) => ({ ...r }))]))
  const consultas: ConsultaGravada[] = []
  let relogio = Date.parse('2026-11-17T12:00:00Z')

  function from(table: string) {
    tabelas[table] ??= []
    const preds: ((r: Row) => boolean)[] = []
    const eq: Record<string, unknown> = {}
    let op: ConsultaGravada['op'] = 'select'
    let colunas: string[] | null = null
    let patch: Row = {}
    let novo: Row | null = null
    let ordenar: string | null = null
    let limite = Infinity
    let unico: 'maybe' | 'single' | null = null

    const chain: Record<string, unknown> = {
      select(c?: string) {
        colunas = !c || c.trim() === '*' ? null : c.split(',').map((x) => x.trim())
        return chain
      },
      insert(v: Row) { op = 'insert'; novo = v; return chain },
      update(v: Row) { op = 'update'; patch = v; return chain },
      delete() { op = 'delete'; return chain },
      eq(c: string, v: unknown) { eq[c] = v; preds.push((r) => r[c] === v); return chain },
      not(c: string, o: string, v: unknown) {
        preds.push((r) => (o === 'is' ? r[c] !== v && !(v === null && r[c] == null) : r[c] !== v))
        return chain
      },
      is(c: string, v: unknown) { preds.push((r) => (v === null ? r[c] == null : r[c] === v)); return chain },
      in(c: string, vs: unknown[]) { preds.push((r) => vs.includes(r[c])); return chain },
      order(c: string) { ordenar = c; return chain },
      limit(n: number) { limite = n; return chain },
      maybeSingle() { unico = 'maybe'; return chain },
      single() { unico = 'single'; return chain },
    }

    const proj = (r: Row): Row => (colunas ? Object.fromEntries(colunas.map((c) => [c, r[c]])) : { ...r })

    chain.then = (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) => {
      consultas.push({ table, op, eq: { ...eq } })
      let data: unknown
      let error: unknown = null
      if (op === 'insert') {
        const agora = new Date((relogio += 1000)).toISOString()
        const linha = { id: randomUUID(), created_at: agora, updated_at: agora, ...novo }
        tabelas[table]!.push(linha)
        data = [linha]
      } else {
        const alvo = tabelas[table]!.filter((r) => preds.every((p) => p(r)))
        if (op === 'update') { for (const r of alvo) Object.assign(r, patch); data = alvo }
        else if (op === 'delete') { tabelas[table] = tabelas[table]!.filter((r) => !alvo.includes(r)); data = alvo }
        else data = alvo
      }
      let lista = data as Row[]
      if (ordenar) { const o = ordenar; lista = [...lista].sort((a, b) => String(b[o]).localeCompare(String(a[o]))) }
      lista = lista.slice(0, limite).map(proj)
      if (unico) {
        if (!lista.length && unico === 'single') { data = null; error = { code: 'PGRST116', message: 'sem linha' } }
        else data = lista[0] ?? null
      } else data = lista
      return Promise.resolve({ data, error }).then(ok, err)
    }
    return chain
  }

  const objetos = new Map<string, Blob>()
  const eventosStorage: { op: string; caminho: string; extra?: unknown }[] = []
  const storage = {
    from(bucket: string) {
      return {
        async createSignedUploadUrl(caminho: string) {
          eventosStorage.push({ op: 'upload-url', caminho, extra: bucket })
          return { data: { signedUrl: `https://storage.exemplo/${bucket}/${caminho}?up`, token: 'tok', path: caminho }, error: null }
        },
        async download(caminho: string) {
          const b = objetos.get(caminho)
          return b ? { data: b, error: null } : { data: null, error: { message: 'Object not found' } }
        },
        async remove(caminhos: string[]) {
          for (const c of caminhos) objetos.delete(c)
          eventosStorage.push({ op: 'remove', caminho: caminhos.join(',') })
          return { data: null, error: null }
        },
        async createSignedUrl(caminho: string, segundos: number, opcoes?: unknown) {
          eventosStorage.push({ op: 'signed-url', caminho, extra: { segundos, opcoes } })
          return { data: { signedUrl: `https://storage.exemplo/${bucket}/${caminho}?sig` }, error: null }
        },
      }
    },
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { db: { from, storage } as any, tabelas, consultas, objetos, eventosStorage }
}
