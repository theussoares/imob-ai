import { describe, expect, test } from 'vitest'
import { getAiTone } from '~~/server/repositories/tenant.repository'
import { fakeSupabase, hadEq } from '../helpers/fake-supabase'

/**
 * O id de rota do endpoint (`server/api/admin/properties/[id]/descricao.post.ts`)
 * não tem função pura própria — a validação é `idDeRota`, já coberta por
 * `test/server/id-de-rota.test.ts`. A ordem das guardas da geração está em
 * `test/server/gerar-descricao.test.ts`, contra `server/utils/gerar-descricao.ts`.
 */
describe('getAiTone', () => {
  const TENANT = 't1'

  test('filtra pelo tenant', async () => {
    const { client, calls } = fakeSupabase({ tenants: { data: { ai_tone: 'caloroso' }, error: null } })
    await getAiTone(client, TENANT)
    expect(hadEq(calls, 'tenants', 'id')).toBe(true)
    const eq = calls.find((c) => c.table === 'tenants' && c.method === 'eq' && c.args[0] === 'id')
    expect(eq?.args[1]).toBe(TENANT)
  })

  // Comportamental, não leitura de texto: `public-payload-guardrail.test.ts` já
  // varre `tenant.repository.ts` inteiro atrás de `select('*')` não declarado —
  // duplicar essa varredura aqui só criaria duas fontes para a mesma checagem.
  test('usa select explícito, não select(*)', async () => {
    const { client, calls } = fakeSupabase({ tenants: { data: { ai_tone: 'caloroso' }, error: null } })
    await getAiTone(client, TENANT)
    const select = calls.find((c) => c.table === 'tenants' && c.method === 'select')
    expect(select?.args).toEqual(['ai_tone'])
  })

  test("linha com valor fora da lista cai em 'sobrio'", async () => {
    const { client } = fakeSupabase({ tenants: { data: { ai_tone: 'agressivo' }, error: null } })
    expect(await getAiTone(client, TENANT)).toBe('sobrio')
  })

  test("linha nula cai em 'sobrio'", async () => {
    const { client } = fakeSupabase({ tenants: { data: null, error: null } })
    expect(await getAiTone(client, TENANT)).toBe('sobrio')
  })
})
