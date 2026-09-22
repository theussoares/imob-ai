import { describe, expect, test } from 'vitest'
import { fakeSupabase } from '../helpers/fake-supabase'
import { concluirGeracao, reservarGeracao } from '~~/server/repositories/ai-generation.repository'

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
    await concluirGeracao(client, 'gen-1', { inputTokens: 500, outputTokens: 300, model: 'm' })
    const update = calls.find((c) => c.method === 'update')
    expect(update?.args[0]).toMatchObject({ status: 'concluida', input_tokens: 500, output_tokens: 300 })
    expect(calls).toContainEqual(expect.objectContaining({ method: 'eq', args: ['id', 'gen-1'] }))
  })
})
