import { describe, expect, test } from 'vitest'
import { listTasks } from '~~/server/repositories/lead-activity.repository'
import { fakeSupabase, hadEq } from '../helpers/fake-supabase'

/**
 * Histórico de visitas feitas na Agenda (MELHORIA 09, teste de 27/09).
 *
 * O que importa aqui é o recorte: o histórico é da imobiliária da sessão, só de
 * concluídas (cancelada não é "feita") e com teto — a agenda não precisa do ano
 * inteiro para mostrar a última semana.
 */
describe('listTasks com doneSince', () => {
  test('só concluídas desde a data, sem canceladas, desta imobiliária', async () => {
    const { client, calls } = fakeSupabase({ lead_tasks: { data: [], error: null } })
    await listTasks(client, 't1', { doneSince: '2026-09-20T00:00:00.000Z' })

    expect(hadEq(calls, 'lead_tasks', 'tenant_id')).toBe(true)
    expect(calls.some((c) => c.method === 'gte' && c.args[0] === 'done_at')).toBe(true)
    expect(calls.some((c) => c.method === 'is' && c.args[0] === 'canceled_at' && c.args[1] === null)).toBe(true)
    // Mais recentes primeiro, com teto.
    expect(calls.some((c) => c.method === 'order' && c.args[0] === 'done_at')).toBe(true)
    expect(calls.some((c) => c.method === 'limit' && c.args[0] === 100)).toBe(true)
  })

  test('sem doneSince, a agenda continua como era (por vencimento)', async () => {
    const { client, calls } = fakeSupabase({ lead_tasks: { data: [], error: null } })
    await listTasks(client, 't1', { openOnly: true })
    expect(calls.some((c) => c.method === 'order' && c.args[0] === 'due_at')).toBe(true)
    expect(calls.some((c) => c.method === 'gte' && c.args[0] === 'done_at')).toBe(false)
  })
})
