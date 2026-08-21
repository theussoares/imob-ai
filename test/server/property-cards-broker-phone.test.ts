import { describe, expect, test } from 'vitest'
import { listActivePropertyCards } from '~~/server/repositories/property.repository'
import { fakeSupabase } from '../helpers/fake-supabase'

function cardRow(over: Record<string, unknown> = {}) {
 return {
  id: 'p1',
  code: 'NC-0231',
  title: 'Casa no Centro',
  type: 'casa',
  purpose: 'venda',
  price: 350000,
  neighborhood: 'Centro',
  city: 'Três Lagoas',
  bedrooms: 3,
  suites: 1,
  bathrooms: 2,
  parking: 2,
  area: 180,
  high_standard: false,
  featured: false,
  broker_id: null,
  property_images: [],
  ...over,
 }
}

describe('listActivePropertyCards', () => {
 test('anexa brokerPhone quando o imóvel tem corretor com telefone', async () => {
  const { client } = fakeSupabase({
   properties: {
    data: [cardRow({ broker_id: 'b1' })],
    error: null,
   },
   brokers: {
    data: [{ id: 'b1', tenant_id: 't1', name: 'Ana', phone: '55 67 99999-1111', email: null, creci: null, active: true }],
    error: null,
   },
  })

  const list = await listActivePropertyCards(client, 't1')

  expect(list).toHaveLength(1)
  expect(list[0]?.brokerPhone).toBe('55 67 99999-1111')
 })

 // Corretor sai da imobiliária e o admin desmarca "Ativo". Os imóveis que ele
 // captou seguem publicados, então sem este filtro o botão de WhatsApp do card
 // continuaria abrindo conversa no número pessoal do ex-corretor.
 test('ignora telefone de corretor inativo e cai no fallback da imobiliária', async () => {
  const { client } = fakeSupabase({
   properties: {
    data: [cardRow({ broker_id: 'b1' })],
    error: null,
   },
   brokers: {
    data: [{ id: 'b1', tenant_id: 't1', name: 'Ana', phone: '55 67 99999-1111', email: null, creci: null, active: false }],
    error: null,
   },
  })

  const list = await listActivePropertyCards(client, 't1')

  expect(list[0]?.brokerPhone).toBeNull()
 })

 test('mantém brokerPhone vazio quando não há corretor vinculado', async () => {
  const { client } = fakeSupabase({
   properties: {
    data: [cardRow()],
    error: null,
   },
  })

  const list = await listActivePropertyCards(client, 't1')

  expect(list).toHaveLength(1)
  expect(list[0]?.brokerPhone).toBeNull()
 })
})
