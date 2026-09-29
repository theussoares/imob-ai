import { describe, expect, test } from 'vitest'
import {
  getPropertyByCodeWithBrokerPhone,
  listActivePropertyCards,
  whatsappTargetForCode,
} from '~~/server/repositories/property.repository'
import { toListingContactSettings } from '~~/server/mappers/broker.mapper'
import { fakeSupabase, touched } from '../helpers/fake-supabase'

/**
 * Contato na página do imóvel, por imobiliária (0059).
 *
 * A ameaça que estes testes cobrem é o celular do corretor chegar ao site de
 * uma imobiliária que pediu o WhatsApp no número dela. Esconder no navegador
 * não resolve — o número ficaria no JSON da página —, então o que se afirma
 * aqui é o payload do servidor, não a tela.
 *
 * Os três caminhos que conhecem o captador (detalhe, cards e registro do
 * clique) precisam concordar: se o card mandasse para o corretor e o detalhe
 * para a imobiliária, o mesmo imóvel teria dois destinos; se o clique não
 * seguisse a regra, o painel diria "foi para o corretor" sobre uma conversa
 * que caiu no número da imobiliária.
 */

const CELULAR = '5567999991111'

const broker = {
  id: 'b1',
  tenant_id: 't1',
  name: 'Ana Captadora',
  phone: CELULAR,
  email: 'ana@exemplo.com',
  creci: '12345-F',
  active: true,
  photo_url: 'https://cdn.exemplo/ana.jpg',
  bio: 'Bio da página Quem somos',
  public_visible: false,
  receives_leads: true,
  last_lead_at: null,
}

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
    features: [],
    status: 'active',
    featured: false,
    created_at: '2026-08-21T10:00:00.000Z',
    updated_at: '2026-08-21T10:00:00.000Z',
    broker_id: 'b1',
    property_images: [],
    ...over,
  }
}

function comConfig(visivel: boolean, destino: string, brokerOver: Record<string, unknown> = {}) {
  return fakeSupabase({
    properties: { data: [propertyRow()], error: null },
    brokers: { data: [{ ...broker, ...brokerOver }], error: null },
    tenants: { data: { listing_broker_visible: visivel, whatsapp_target: destino }, error: null },
  })
}

describe('detalhe do imóvel — as quatro combinações', () => {
  test('mostra o captador e manda o WhatsApp para a imobiliária: nome sim, celular não', async () => {
    const { client } = comConfig(true, 'imobiliaria')
    const p = await getPropertyByCodeWithBrokerPhone(client, 't1', 'NC-0231')

    expect(p?.listingBroker).toEqual({ name: 'Ana Captadora', photoUrl: 'https://cdn.exemplo/ana.jpg', creci: '12345-F' })
    expect(p?.brokerPhone).toBeNull()
    expect(JSON.stringify(p)).not.toContain(CELULAR)
  })

  test('mostra o captador e manda o WhatsApp para ele', async () => {
    const { client } = comConfig(true, 'captador')
    const p = await getPropertyByCodeWithBrokerPhone(client, 't1', 'NC-0231')

    expect(p?.listingBroker?.name).toBe('Ana Captadora')
    expect(p?.brokerPhone).toBe(CELULAR)
  })

  test('esconde o captador e manda o WhatsApp para ele (o comportamento de antes da 0059)', async () => {
    const { client } = comConfig(false, 'captador')
    const p = await getPropertyByCodeWithBrokerPhone(client, 't1', 'NC-0231')

    expect(p?.listingBroker).toBeNull()
    expect(p?.brokerPhone).toBe(CELULAR)
  })

  test('esconde o captador e manda para a imobiliária: nem consulta o corretor', async () => {
    const { client, calls } = comConfig(false, 'imobiliaria')
    const p = await getPropertyByCodeWithBrokerPhone(client, 't1', 'NC-0231')

    expect(p?.listingBroker).toBeUndefined()
    expect(p?.brokerPhone).toBeUndefined()
    expect(touched(calls, 'brokers')).toBe(false)
  })

  // Quem saiu da imobiliária não pode seguir aparecendo como quem atende.
  test('corretor inativo não aparece nem recebe o WhatsApp', async () => {
    const { client } = comConfig(true, 'captador', { active: false })
    const p = await getPropertyByCodeWithBrokerPhone(client, 't1', 'NC-0231')

    expect(p?.listingBroker).toBeNull()
    expect(p?.brokerPhone).toBeNull()
  })

  // O captador visível é um recorte do cadastro, não o cadastro. `bio` foi
  // escrita para "Quem somos" e o e-mail é interno.
  test('o captador visível leva só nome, foto e CRECI', async () => {
    const { client } = comConfig(true, 'imobiliaria')
    const p = await getPropertyByCodeWithBrokerPhone(client, 't1', 'NC-0231')

    expect(Object.keys(p?.listingBroker ?? {}).sort()).toEqual(['creci', 'name', 'photoUrl'])
    expect(JSON.stringify(p)).not.toContain('ana@exemplo.com')
    expect(JSON.stringify(p)).not.toContain('Quem somos')
  })
})

describe('cards do catálogo', () => {
  test('WhatsApp na imobiliária: o card não carrega o celular e o corretor nem é consultado', async () => {
    const { client, calls } = comConfig(true, 'imobiliaria')
    const [card] = await listActivePropertyCards(client, 't1')

    expect(card?.brokerPhone).toBeNull()
    expect(touched(calls, 'brokers')).toBe(false)
  })

  test('WhatsApp no captador: o card leva o celular dele, e nunca o nome', async () => {
    const { client } = comConfig(true, 'captador')
    const [card] = await listActivePropertyCards(client, 't1')

    expect(card?.brokerPhone).toBe(CELULAR)
    expect(JSON.stringify(card)).not.toContain('Ana Captadora')
  })
})

describe('registro do clique no WhatsApp', () => {
  test('WhatsApp na imobiliária: o clique não é atribuído ao captador', async () => {
    const { client } = comConfig(true, 'imobiliaria')
    const alvo = await whatsappTargetForCode(client, 't1', 'NC-0231')

    expect(alvo).toEqual({ propertyId: 'p1', brokerId: null })
  })

  test('WhatsApp no captador: o clique é dele', async () => {
    const { client } = comConfig(false, 'captador')
    const alvo = await whatsappTargetForCode(client, 't1', 'NC-0231')

    expect(alvo).toEqual({ propertyId: 'p1', brokerId: 'b1' })
  })
})

describe('leitura da configuração', () => {
  // Sem a linha (ou antes da migration chegar ao banco), o site continua como
  // sempre foi, em vez de passar a esconder ou a mostrar alguém.
  test('sem linha, vale o comportamento de antes da 0059', () => {
    expect(toListingContactSettings(null)).toEqual({ showListingBroker: false, whatsappTarget: 'captador' })
  })

  test('destino fora da lista cai no default', () => {
    expect(toListingContactSettings({ listing_broker_visible: true, whatsapp_target: 'corretor' })).toEqual({
      showListingBroker: true,
      whatsappTarget: 'captador',
    })
  })
})
