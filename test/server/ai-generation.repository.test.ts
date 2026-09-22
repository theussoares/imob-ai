import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { fakeSupabase, hadEq } from '../helpers/fake-supabase'
import {
  concluirGeracao,
  contarNoMes,
  marcarFalha,
  reservarGeracao,
} from '~~/server/repositories/ai-generation.repository'

const TENANT = 't1'
const USER = 'u1'

describe('reservarGeracao', () => {
  test('devolve o id quando a reserva cabe na cota', async () => {
    const { client, calls } = fakeSupabase({}, { reservar_geracao_ia: { data: 'gen-1', error: null } })
    const id = await reservarGeracao(client, {
      tenantId: TENANT, createdBy: USER, propertyId: null, kind: 'descricao', model: 'm',
    })
    expect(id).toBe('gen-1')
    // O tenant é argumento da função, e é ele que o advisory lock usa. Sem isso
    // o lock serializaria a plataforma inteira em vez de um cliente.
    expect(calls[0]).toMatchObject({ table: 'rpc:reservar_geracao_ia' })
    expect((calls[0].args[0] as Record<string, unknown>).p_tenant_id).toBe(TENANT)
  })

  test('devolve null quando a cota estourou', async () => {
    const { client } = fakeSupabase({}, { reservar_geracao_ia: { data: null, error: null } })
    const id = await reservarGeracao(client, {
      tenantId: TENANT, createdBy: USER, propertyId: null, kind: 'descricao', model: 'm',
    })
    expect(id).toBeNull()
  })

  /**
   * O desvio deliberado de `assertSubmitRateLimit`, que falha ABERTO.
   *
   * Aquele limite protege o formulário do cliente e erra para deixar passar.
   * Este protege dinheiro: falhar aberto com o banco instável significa freio
   * desligado e conta sem teto. Falso bloqueio custa um retry; falso passe não
   * tem limite. Sem este teste, alguém "corrige" por consistência.
   */
  test('erro na reserva BLOQUEIA — falha fechada', async () => {
    const { client } = fakeSupabase({}, { reservar_geracao_ia: { data: null, error: { message: 'timeout' } } })
    await expect(reservarGeracao(client, {
      tenantId: TENANT, createdBy: USER, propertyId: null, kind: 'descricao', model: 'm',
    })).rejects.toMatchObject({ statusCode: 429 })
  })
})

describe('concluirGeracao', () => {
  test('grava tokens e status na linha reservada', async () => {
    const { client, calls } = fakeSupabase({ ai_generations: { data: null, error: null } })
    await concluirGeracao(client, 'gen-1', TENANT, { inputTokens: 500, outputTokens: 300, model: 'm' })
    const update = calls.find((c) => c.method === 'update')
    expect(update?.args[0]).toMatchObject({ status: 'concluida', input_tokens: 500, output_tokens: 300 })
    expect(calls).toContainEqual(expect.objectContaining({ method: 'eq', args: ['id', 'gen-1'] }))
  })

  /**
   * Defesa em profundidade: `serviceSupabase()` ignora RLS, e mesmo o `id`
   * vindo sempre da própria reserva hoje, um update sem `.eq('tenant_id', …)`
   * deixaria a porta aberta para um chamador futuro com `id` de fonte menos
   * confiável escrever na linha de outro tenant.
   */
  test('escopa o update por tenant_id', async () => {
    const { client, calls } = fakeSupabase({ ai_generations: { data: null, error: null } })
    await concluirGeracao(client, 'gen-1', TENANT, { inputTokens: 500, outputTokens: 300, model: 'm' })
    expect(hadEq(calls, 'ai_generations', 'tenant_id')).toBe(true)
    const eq = calls.find((c) => c.table === 'ai_generations' && c.method === 'eq' && c.args[0] === 'tenant_id')
    expect(eq?.args[1]).toBe(TENANT)
  })
})

describe('marcarFalha', () => {
  test('marca a linha como falhou, escopado por tenant_id', async () => {
    const { client, calls } = fakeSupabase({ ai_generations: { data: null, error: null } })
    await marcarFalha(client, 'gen-1', TENANT)
    const update = calls.find((c) => c.method === 'update')
    expect(update?.args[0]).toMatchObject({ status: 'falhou' })
    expect(calls).toContainEqual(expect.objectContaining({ method: 'eq', args: ['id', 'gen-1'] }))
    expect(hadEq(calls, 'ai_generations', 'tenant_id')).toBe(true)
    const eq = calls.find((c) => c.table === 'ai_generations' && c.method === 'eq' && c.args[0] === 'tenant_id')
    expect(eq?.args[1]).toBe(TENANT)
  })
})

describe('contarNoMes', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('filtra por tenant_id e por kind', async () => {
    vi.setSystemTime(new Date('2026-09-15T12:00:00.000Z'))
    const { client, calls } = fakeSupabase({ ai_generations: { data: null, error: null, count: 3 } })
    const total = await contarNoMes(client, TENANT, 'descricao')
    expect(total).toBe(3)
    expect(hadEq(calls, 'ai_generations', 'tenant_id')).toBe(true)
    const kindEq = calls.find((c) => c.table === 'ai_generations' && c.method === 'eq' && c.args[0] === 'kind')
    expect(kindEq?.args[1]).toBe('descricao')
  })

  /**
   * O bug que este teste trava: 2026-11-01T01:00:00Z são 31/10 22h em SP. O
   * calendário UTC já diz "novembro"; o calendário de SP, que é o que a RPC
   * `reservar_geracao_ia` usa (`now() at time zone 'America/Sao_Paulo'`),
   * ainda diz "outubro". Se `contarNoMes` extrair ano/mês do `agora` cru em
   * UTC, o início do recorte cai em 2026-11-01 — no FUTURO em relação ao
   * instante corrente — e a query não casa nenhuma linha, mesmo havendo
   * gerações no mês (outubro, pela cota de verdade). O saldo mostrado (0 de
   * 100) discordaria do que a RPC realmente aplica (cota de outubro).
   */
  test('na virada do mês em UTC mas não em SP, o recorte começa em outubro', async () => {
    vi.setSystemTime(new Date('2026-11-01T01:00:00.000Z'))
    const { client, calls } = fakeSupabase({ ai_generations: { data: null, error: null, count: 0 } })
    await contarNoMes(client, TENANT, 'descricao')
    const gte = calls.find((c) => c.table === 'ai_generations' && c.method === 'gte')
    // Início de OUTUBRO (mês em SP), não de novembro (mês em UTC) — é a
    // mesma virada que `date_trunc('month', now() at time zone
    // 'America/Sao_Paulo')` produz na RPC.
    expect(gte?.args[1]).toBe('2026-10-01T03:00:00.000Z')
  })
})
