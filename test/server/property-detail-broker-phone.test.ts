import { describe, expect, test } from 'vitest'
import { getPropertyByCodeWithBrokerPhone } from '~~/server/repositories/property.repository'
import { fakeSupabase, touched } from '../helpers/fake-supabase'

function propertyRow(over: Record<string, unknown> = {}) {
 return {
  id: 'p1',
  tenant_id: 't1',
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
  features: ['quintal'],
  status: 'active',
  featured: false,
  created_at: '2026-08-21T10:00:00.000Z',
  updated_at: '2026-08-21T10:00:00.000Z',
  location: null,
  broker_id: null,
  owner_name: null,
  owner_phone: null,
  property_images: [],
  ...over,
 }
}

describe('getPropertyByCodeWithBrokerPhone', () => {
 test('retorna brokerPhone quando o imóvel tem corretor vinculado com telefone', async () => {
  const { client } = fakeSupabase({
   properties: { data: [propertyRow({ broker_id: 'b1' })], error: null },
   brokers: {
    data: [{ id: 'b1', tenant_id: 't1', name: 'Ana', phone: '55 67 99999-1111', email: null, creci: null, active: true }],
    error: null,
   },
  })

  const property = await getPropertyByCodeWithBrokerPhone(client, 't1', 'NC-0231')

  expect(property?.code).toBe('NC-0231')
  expect(property?.brokerPhone).toBe('55 67 99999-1111')
 })

 test('ignora telefone de corretor inativo', async () => {
  const { client } = fakeSupabase({
   properties: { data: [propertyRow({ broker_id: 'b1' })], error: null },
   brokers: {
    data: [{ id: 'b1', tenant_id: 't1', name: 'Ana', phone: '55 67 99999-1111', email: null, creci: null, active: false }],
    error: null,
   },
  })

  const property = await getPropertyByCodeWithBrokerPhone(client, 't1', 'NC-0231')

  expect(property?.brokerPhone).toBeNull()
 })

 // A row do fake traz todas as colunas da tabela, inclusive as internas — é
 // exatamente o que o Postgrest devolve num `select('*')`.
 test('não devolve campos internos no payload público', async () => {
  const { client } = fakeSupabase({
   properties: {
    data: [propertyRow({ updated_by: 'uuid-do-funcionario', location: 'Rua Secreta, 123', owner_name: 'Dono Silva' })],
    error: null,
   },
  })

  const property = await getPropertyByCodeWithBrokerPhone(client, 't1', 'NC-0231')

  expect(Object.keys(property ?? {})).not.toContain('updatedBy')
  expect(property?.location).toBeUndefined()
  expect(property?.ownerName).toBeUndefined()
 })

 test('pede só as colunas públicas, nunca `*`', async () => {
  const { client, calls } = fakeSupabase({
   properties: { data: [propertyRow()], error: null },
  })

  await getPropertyByCodeWithBrokerPhone(client, 't1', 'NC-0231')

  const select = calls.find((c) => c.table === 'properties' && c.method === 'select')
  expect(String(select?.args[0])).not.toMatch(/^\*|\B\*/)
 })

 test('não consulta corretores quando o imóvel não tem broker_id', async () => {
  const { client, calls } = fakeSupabase({
   properties: { data: [propertyRow()], error: null },
  })

  const property = await getPropertyByCodeWithBrokerPhone(client, 't1', 'NC-0231')

  expect(property?.brokerPhone).toBeUndefined()
  expect(touched(calls, 'brokers')).toBe(false)
 })
})
