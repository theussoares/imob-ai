import { describe, expect, test } from 'vitest'
import { getPropertyByCodeWithCaptador } from '~~/server/repositories/property.repository'
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

describe('getPropertyByCodeWithCaptador', () => {
 // O WhatsApp do site é sempre o da imobiliária: o captador é só apresentação,
 // então nem telefone nem e-mail dele podem estar no payload.
 test('expõe o captador sem telefone nem e-mail', async () => {
  const { client } = fakeSupabase({
   properties: { data: [propertyRow({ broker_id: 'b1' })], error: null },
   brokers: {
    data: [{ id: 'b1', name: 'Ana', phone: '55 67 99999-1111', email: 'ana@exemplo.com', creci: '12345', photo_url: 'https://x/ana.jpg', bio: 'Corretora', active: true }],
    error: null,
   },
  })

  const property = await getPropertyByCodeWithCaptador(client, 't1', 'NC-0231')

  expect(property?.capturedBy).toEqual({ id: 'b1', name: 'Ana', photoUrl: 'https://x/ana.jpg', bio: 'Corretora', creci: '12345' })
  const json = JSON.stringify(property)
  expect(json).not.toContain('99999-1111')
  expect(json).not.toContain('ana@exemplo.com')
 })

 test('consulta o corretor escopado por tenant e só ativo', async () => {
  const { client, calls } = fakeSupabase({
   properties: { data: [propertyRow({ broker_id: 'b1' })], error: null },
   brokers: { data: [], error: null },
  })

  const property = await getPropertyByCodeWithCaptador(client, 't1', 'NC-0231')

  // Corretor inativo (ou de outro tenant) não chega: a query o filtra.
  expect(property?.capturedBy).toBeNull()
  const eqs = calls.filter((c) => c.table === 'brokers' && c.method === 'eq').map((c) => c.args.join('='))
  expect(eqs).toContain('tenant_id=t1')
  expect(eqs).toContain('active=true')
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

  const property = await getPropertyByCodeWithCaptador(client, 't1', 'NC-0231')

  expect(Object.keys(property ?? {})).not.toContain('updatedBy')
  expect(property?.location).toBeUndefined()
  expect(property?.ownerName).toBeUndefined()
 })

 test('pede só as colunas públicas, nunca `*`', async () => {
  const { client, calls } = fakeSupabase({
   properties: { data: [propertyRow()], error: null },
  })

  await getPropertyByCodeWithCaptador(client, 't1', 'NC-0231')

  const select = calls.find((c) => c.table === 'properties' && c.method === 'select')
  expect(String(select?.args[0])).not.toMatch(/^\*|\B\*/)
 })

 test('não consulta corretores quando o imóvel não tem broker_id', async () => {
  const { client, calls } = fakeSupabase({
   properties: { data: [propertyRow()], error: null },
  })

  const property = await getPropertyByCodeWithCaptador(client, 't1', 'NC-0231')

  expect(property?.capturedBy).toBeUndefined()
  expect(touched(calls, 'brokers')).toBe(false)
 })
})
