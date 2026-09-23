import { describe, expect, test } from 'vitest'
import { resolverPropertyId } from '~~/server/utils/descricao-prompt'
import { getAiTone } from '~~/server/repositories/tenant.repository'
import { fakeSupabase, hadEq } from '../helpers/fake-supabase'

/**
 * `resolverPropertyId` mora em `descricao-prompt.ts`, e não no endpoint: o
 * endpoint chama `defineEventHandler` no topo do módulo, que não existe em
 * `test/setup.ts` (só os auto-imports que o código de servidor realmente usa
 * fora do runtime do Nuxt estão lá). Importar do endpoint estouraria antes do
 * primeiro `expect`.
 */
describe('resolverPropertyId', () => {
  // O botão precisa funcionar DURANTE o cadastro, quando não há linha no banco.
  test("'novo' vira null, e a linha de uso nasce sem imóvel", () => {
    expect(resolverPropertyId('novo')).toBeNull()
  })

  test('uuid válido passa', () => {
    const id = '11111111-1111-1111-1111-111111111111'
    expect(resolverPropertyId(id)).toBe(id)
  })

  // 404 e não 403: confirmar existência já diria a um membro de outra
  // imobiliária que aquele id existe em algum lugar.
  test('qualquer outra coisa é 404', () => {
    for (const lixo of ['', 'abc', '../../etc', '1 or 1=1']) {
      expect(() => resolverPropertyId(lixo)).toThrow(expect.objectContaining({ statusCode: 404 }))
    }
  })
})

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
