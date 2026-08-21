import { beforeEach, describe, expect, test } from 'vitest'
import type { Property, PropertyCard } from '~~/shared/models/property'
import { useContact } from '~~/app/composables/useWhatsApp'

const tenantState = { value: { whatsapp: '55 (67) 99888-7777' } }

Object.assign(globalThis, {
 useTenant: () => tenantState,
 onlyDigits: (v?: string | null) => String(v ?? '').replace(/\D/g, ''),
 formatBRL: (n: number) => `R$ ${n.toFixed(2)}`,
})

function makeProperty(over: Partial<Property> = {}): Property {
 return {
  id: 'p1',
  tenantId: 't1',
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
  highStandard: false,
  description: null,
  features: [],
  status: 'active',
  featured: false,
  images: [],
  createdAt: '2026-08-21T10:00:00.000Z',
  updatedAt: '2026-08-21T10:00:00.000Z',
  ...over,
 }
}

function makeCard(over: Partial<PropertyCard> = {}): PropertyCard {
 return {
  id: 'c1',
  code: 'NC-0232',
  title: 'Apartamento no Centro',
  type: 'apartamento',
  purpose: 'venda',
  price: 420000,
  neighborhood: 'Centro',
  city: 'Três Lagoas',
  bedrooms: 2,
  suites: 1,
  bathrooms: 2,
  parking: 1,
  area: 95,
  highStandard: false,
  featured: false,
  cover: null,
  ...over,
 }
}

describe('useContact.whatsappLink', () => {
 beforeEach(() => {
  tenantState.value.whatsapp = '55 (67) 99888-7777'
 })

 test('prioriza o WhatsApp do corretor quando brokerPhone está preenchido', () => {
  const { whatsappLink } = useContact()
  const p = makeProperty({ brokerPhone: '55 (67) 99999-1111' })

  const link = whatsappLink(p)
  const url = new URL(link)

  expect(url.host).toBe('wa.me')
  expect(url.pathname).toBe('/5567999991111')
 })

 test('faz fallback para WhatsApp da imobiliária quando não há telefone do corretor', () => {
  const { whatsappLink } = useContact()
  const p = makeProperty({ brokerPhone: null })

  const link = whatsappLink(p)
  const url = new URL(link)

  expect(url.host).toBe('wa.me')
  expect(url.pathname).toBe('/5567998887777')
 })

 test('na listagem (PropertyCard), prioriza o WhatsApp do corretor', () => {
  const { whatsappLink } = useContact()
  const p = makeCard({ brokerPhone: '55 (67) 97777-6666' })

  const link = whatsappLink(p)
  const url = new URL(link)

  expect(url.host).toBe('wa.me')
  expect(url.pathname).toBe('/5567977776666')
 })
})
