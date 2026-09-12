import { describe, expect, test } from 'vitest'
import {
  createProperty,
  deleteProperty,
  getPropertyById,
  listAllProperties,
  updateProperty,
} from '~~/server/repositories/property.repository'
import { fakeSupabase, hadEq } from '../helpers/fake-supabase'

/**
 * Guarda de escopo por tenant nas operações de imóvel do PAINEL.
 *
 * Desde a 0031 estes caminhos rodam com SERVICE ROLE (a migration fechou as
 * colunas internas para o papel `authenticated`, e o painel precisa lê-las).
 * Service role IGNORA RLS — ou seja, o `.eq('tenant_id', ...)` dentro do
 * repositório deixou de ser uma otimização e passou a ser a ÚNICA barreira entre
 * as imobiliárias.
 *
 * Este arquivo existe para que um refactor que remova esse filtro quebre aqui, e
 * não em produção com dado de cliente trocado. É o mesmo papel que
 * `public-payload-guardrail.test.ts` cumpre para o payload público.
 */

const TENANT = 't1'
const OUTRO_TENANT = 't2'

function propertyRow(over: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    tenant_id: TENANT,
    code: 'NC-0231',
    title: 'Casa no Centro',
    type: 'casa',
    purpose: 'venda',
    price: 350000,
    neighborhood: 'Centro',
    city: 'Três Lagoas',
    state: 'MS',
    bedrooms: 3,
    suites: 1,
    bathrooms: 2,
    parking: 2,
    area: 180,
    high_standard: false,
    description: 'Imóvel bem localizado',
    features: [],
    status: 'active',
    featured: false,
    created_at: '2026-09-01T10:00:00.000Z',
    updated_at: '2026-09-01T10:00:00.000Z',
    location: 'Rua Interna, 123',
    broker_id: null,
    owner_name: 'Dono Silva',
    owner_phone: '5567999990000',
    property_images: [],
    ...over,
  }
}

const input = {
  code: 'NC-0231',
  title: 'Casa no Centro',
  type: 'casa' as const,
  purpose: 'venda' as const,
  price: 350000,
  images: [],
}

describe('escopo por tenant nas leituras do painel', () => {
  test('listAllProperties filtra por tenant_id', async () => {
    const { client, calls } = fakeSupabase({
      properties: { data: [propertyRow()], error: null },
    })

    await listAllProperties(client, TENANT)

    expect(hadEq(calls, 'properties', 'tenant_id')).toBe(true)
    const eq = calls.find((c) => c.table === 'properties' && c.method === 'eq' && c.args[0] === 'tenant_id')
    expect(eq?.args[1]).toBe(TENANT)
  })

  test('getPropertyById filtra por tenant_id E por id', async () => {
    const { client, calls } = fakeSupabase({
      properties: { data: propertyRow(), error: null },
    })

    await getPropertyById(client, TENANT, 'p1')

    expect(hadEq(calls, 'properties', 'tenant_id')).toBe(true)
    expect(hadEq(calls, 'properties', 'id')).toBe(true)
  })

  test('getPropertyById não devolve imóvel de outro tenant por id direto', async () => {
    // O banco devolve vazio porque o filtro de tenant foi aplicado. O que este
    // teste trava é o filtro existir — sem ele, service role devolveria a linha.
    const { client, calls } = fakeSupabase({
      properties: { data: null, error: null },
    })

    const property = await getPropertyById(client, OUTRO_TENANT, 'p1')

    expect(property).toBeNull()
    const eq = calls.find((c) => c.table === 'properties' && c.method === 'eq' && c.args[0] === 'tenant_id')
    expect(eq?.args[1]).toBe(OUTRO_TENANT)
  })
})

describe('escopo por tenant nas escritas do painel', () => {
  test('createProperty grava o tenant_id na linha', async () => {
    const { client, calls } = fakeSupabase({
      properties: [
        { data: propertyRow(), error: null },
        { data: propertyRow(), error: null },
      ],
    })

    await createProperty(client, TENANT, input, 'user-1')

    const insert = calls.find((c) => c.table === 'properties' && c.method === 'insert')
    expect((insert?.args[0] as Record<string, unknown>)?.tenant_id).toBe(TENANT)
  })

  test('updateProperty filtra por tenant_id E por id', async () => {
    const { client, calls } = fakeSupabase({
      properties: [
        { data: [{ id: 'p1' }], error: null },
        { data: propertyRow(), error: null },
      ],
    })

    await updateProperty(client, TENANT, 'p1', input, null, 'user-1')

    expect(hadEq(calls, 'properties', 'tenant_id')).toBe(true)
    expect(hadEq(calls, 'properties', 'id')).toBe(true)
  })

  test('deleteProperty filtra por tenant_id E por id', async () => {
    const { client, calls } = fakeSupabase({
      properties: { data: null, error: null },
    })

    await deleteProperty(client, TENANT, 'p1')

    expect(hadEq(calls, 'properties', 'tenant_id')).toBe(true)
    expect(hadEq(calls, 'properties', 'id')).toBe(true)
  })
})

describe('nenhuma operação de painel toca properties sem filtro de tenant', () => {
  test('toda cadeia enviada a properties carrega eq(tenant_id)', async () => {
    // Varredura: para cada operação do painel, confere que houve início de
    // cadeia em `properties` E que a cadeia levou o escopo de tenant. Pega o
    // caso de alguém adicionar uma query nova sem o filtro — que, rodando com
    // service role, passaria a atravessar imobiliárias em silêncio.
    const cenarios: Array<{ nome: string; resultado: unknown; run: (c: never) => Promise<unknown> }> = [
      {
        nome: 'listAllProperties',
        resultado: { data: [propertyRow()], error: null },
        run: (c) => listAllProperties(c, TENANT),
      },
      {
        nome: 'getPropertyById',
        resultado: { data: propertyRow(), error: null },
        run: (c) => getPropertyById(c, TENANT, 'p1'),
      },
      {
        nome: 'deleteProperty',
        resultado: { data: null, error: null },
        run: (c) => deleteProperty(c, TENANT, 'p1'),
      },
    ]

    for (const cenario of cenarios) {
      const { client, calls } = fakeSupabase({ properties: cenario.resultado as never })
      await cenario.run(client)

      const iniciosDeCadeia = calls.filter(
        (c) => c.table === 'properties' && ['select', 'update', 'delete', 'insert'].includes(c.method),
      )
      expect(iniciosDeCadeia.length, cenario.nome).toBeGreaterThan(0)
      expect(hadEq(calls, 'properties', 'tenant_id'), cenario.nome).toBe(true)
    }
  })
})
