import { describe, expect, test } from 'vitest'
import { purgeStaleLeads } from '~~/server/repositories/lead.repository'
import { LEAD_RETENCAO_MESES, corteDeRetencaoDeLeads } from '~~/shared/models/lead'
import { fakeSupabase } from '../helpers/fake-supabase'

/**
 * O expurgo apaga dado de cliente em produção, todo dia, sem ninguém olhando.
 * O que estes testes guardam é o delete que apaga o que não devia: um lead que
 * virou negócio, um com retorno marcado para amanhã, ou um corte de data que
 * escorrega e leva os leads do mês passado junto.
 */
describe('retenção de leads', () => {
  test('o corte é 24 meses antes de agora', () => {
    expect(LEAD_RETENCAO_MESES).toBe(24)
    expect(corteDeRetencaoDeLeads(new Date('2026-09-25T12:00:00Z')).toISOString()).toBe('2024-09-25T12:00:00.000Z')
  })

  test('o delete leva as três travas: corte, fechado de fora, retorno futuro de fora', async () => {
    const { client, calls } = fakeSupabase({ leads: { data: [{ id: 'a' }, { id: 'b' }], error: null } })
    const antesDe = new Date('2024-09-25T12:00:00Z')
    const agora = new Date('2026-09-25T12:00:00Z')

    expect(await purgeStaleLeads(client, antesDe, agora)).toBe(2)

    const metodo = (m: string) => calls.filter((c) => c.method === m).map((c) => c.args)
    expect(metodo('delete')).toHaveLength(1)
    expect(metodo('lt')).toEqual([['updated_at', '2024-09-25T12:00:00.000Z']])
    expect(metodo('not')).toEqual([['stage', 'eq', 'fechado']])
    expect(metodo('or')).toEqual([['next_contact_at.is.null,next_contact_at.lt.2026-09-25T12:00:00.000Z']])
  })

  test('erro do banco sobe, em vez de virar "zero apagados"', async () => {
    const { client } = fakeSupabase({ leads: { data: null, error: { message: 'boom' } } })
    await expect(purgeStaleLeads(client, new Date(), new Date())).rejects.toEqual({ message: 'boom' })
  })
})
