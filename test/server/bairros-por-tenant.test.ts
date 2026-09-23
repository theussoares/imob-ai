import { describe, expect, test } from 'vitest'
import { fakeSupabase, hadEq } from '../helpers/fake-supabase'
import { listNeighborhoods } from '~~/server/repositories/property.repository'

/**
 * `listNeighborhoods` nasceu para alimentar a canonização do bairro na escrita
 * e a lista de sugestões do painel. É uma query nova sobre `properties` pela
 * service_role — que ignora RLS (invariante 2 do CLAUDE.md). Sem o filtro por
 * tenant à mão, a imobiliária A veria os bairros da B na própria tela de
 * cadastro, e pior: gravaria a grafia da outra nos próprios imóveis.
 */
describe('bairros saem escopados por tenant', () => {
  test('a query filtra por tenant_id', async () => {
    const { client, calls } = fakeSupabase({
      properties: { data: [{ neighborhood: 'Centro' }], error: null },
    })
    await listNeighborhoods(client, 'tenant-1')
    expect(hadEq(calls, 'properties', 'tenant_id')).toBe(true)
  })

  test('o tenant recebido é o que vai no filtro', async () => {
    const { client, calls } = fakeSupabase({ properties: { data: [], error: null } })
    await listNeighborhoods(client, 'tenant-abc')
    const eq = calls.find((c) => c.table === 'properties' && c.method === 'eq')
    expect(eq?.args).toEqual(['tenant_id', 'tenant-abc'])
  })
})

describe('ordem e limpeza', () => {
  // A grafia que a imobiliária mais usa é a que deve vencer na canonização —
  // não a primeira que alguém digitou.
  test('a grafia mais frequente vem primeiro', async () => {
    const { client } = fakeSupabase({
      properties: {
        data: [
          { neighborhood: 'Bela vista da lagoa ' },
          { neighborhood: 'Bela Vista da Lagoa' },
          { neighborhood: 'Bela Vista da Lagoa' },
          { neighborhood: 'Centro' },
        ],
        error: null,
      },
    })
    expect(await listNeighborhoods(client, 't')).toEqual([
      'Bela Vista da Lagoa',
      'Bela vista da lagoa',
      'Centro',
    ])
  })

  test('vazio e só-espaço não entram na lista', async () => {
    const { client } = fakeSupabase({
      properties: { data: [{ neighborhood: '' }, { neighborhood: '   ' }, { neighborhood: 'Centro' }], error: null },
    })
    expect(await listNeighborhoods(client, 't')).toEqual(['Centro'])
  })
})
