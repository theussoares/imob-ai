import { describe, expect, test } from 'vitest'
import { listBrokerNames } from '~~/server/repositories/broker.repository'
import { memoriaSupabase } from '../helpers/memoria-supabase'

const TA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const TB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

describe('corretores do gestão', () => {
  test('só id e nome, só ativos, só do tenant (nada de telefone, e-mail nem corretor de outra imobiliária)', async () => {
    const m = memoriaSupabase({
      brokers: [
        { tenant_id: TA, id: 'b1', name: 'Bia', phone: '67999990000', email: 'bia@x.com', active: true },
        { tenant_id: TA, id: 'b2', name: 'Carlos', phone: '1', email: 'c@x.com', active: false },
        { tenant_id: TB, id: 'b3', name: 'Dora', phone: '2', email: 'd@x.com', active: true },
      ],
    })
    const r = await listBrokerNames(m.db as never, TA)
    expect(r).toEqual([{ id: 'b1', nome: 'Bia' }])
    expect(JSON.stringify(r)).not.toMatch(/phone|email|67999990000/)
    expect(m.consultas.every((c) => c.eq.tenant_id === TA)).toBe(true)
  })
})
