import { describe, expect, test } from 'vitest'
import { listPublicBrokers } from '~~/server/repositories/broker.repository'
import { fakeSupabase, hadEq } from '../helpers/fake-supabase'

/**
 * `listPublicBrokers` alimenta o bloco "equipe" da página "Quem somos", sem
 * login. Nunca pode devolver telefone/e-mail, mesmo que a row tenha vindo
 * completa do banco — é o mesmo raciocínio de public-payload-guardrail.test.ts
 * para `properties`/`tenants`, aplicado a `brokers`.
 */

const fullBrokerRow = {
  id: 'b1',
  tenant_id: 't1',
  name: 'Ana',
  phone: '5567999991111',
  email: 'ana@exemplo.com',
  creci: '12345',
  photo_url: 'https://cdn.exemplo.com/ana.webp',
  bio: 'Corretora há 8 anos.',
  public_visible: true,
  active: true,
}

describe('listPublicBrokers', () => {
  test('devolve só os campos da vitrine, nunca telefone/e-mail', async () => {
    const { client } = fakeSupabase({ brokers: { data: [fullBrokerRow], error: null } })

    const [broker] = await listPublicBrokers(client, 't1')

    expect(broker).toEqual({
      id: 'b1',
      name: 'Ana',
      photoUrl: 'https://cdn.exemplo.com/ana.webp',
      bio: 'Corretora há 8 anos.',
      creci: '12345',
    })
    expect(JSON.stringify(broker)).not.toContain('ana@exemplo.com')
    expect(JSON.stringify(broker)).not.toContain('5567999991111')
  })

  test('filtra por tenant, ativo e opt-in — a query, não só o payload', async () => {
    const { client, calls } = fakeSupabase({ brokers: { data: [fullBrokerRow], error: null } })

    await listPublicBrokers(client, 't1')

    expect(hadEq(calls, 'brokers', 'tenant_id')).toBe(true)
    expect(hadEq(calls, 'brokers', 'active')).toBe(true)
    expect(hadEq(calls, 'brokers', 'public_visible')).toBe(true)
  })

  test('não usa select(*) — leitura pública precisa de colunas explícitas', async () => {
    const { client, calls } = fakeSupabase({ brokers: { data: [], error: null } })

    await listPublicBrokers(client, 't1')

    const select = calls.find((c) => c.table === 'brokers' && c.method === 'select')
    expect(select?.args[0]).not.toBe('*')
    expect(String(select?.args[0])).not.toContain('phone')
    expect(String(select?.args[0])).not.toContain('email')
  })
})
