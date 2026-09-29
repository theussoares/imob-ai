import { describe, expect, test } from 'vitest'
import {
  feedTokenMatches,
  getOrCreateFeedToken,
  listPropertiesForPortalFeed,
} from '~~/server/repositories/portal-feed.repository'
import { fakeSupabase } from '../helpers/fake-supabase'

/**
 * O feed roda pela service role, sem RLS: o filtro de tenant na query é a
 * única coisa que impede o feed de uma imobiliária de listar os imóveis — e os
 * ENDEREÇOS — de outra. E o token é a única coisa entre o endereço e quem
 * adivinhar a URL.
 */

const TOKEN = 'a'.repeat(32)

describe('listPropertiesForPortalFeed', () => {
  test('filtra pelo tenant e só imóvel publicado', async () => {
    const { client, calls } = fakeSupabase({ properties: { data: [], error: null } })
    await listPropertiesForPortalFeed(client as never, 't1')
    const eqs = calls.filter((c) => c.method === 'eq').map((c) => c.args)
    expect(eqs).toContainEqual(['tenant_id', 't1'])
    expect(eqs).toContainEqual(['status', 'active'])
  })

  test('não pede coluna interna além do endereço', async () => {
    const { client, calls } = fakeSupabase({ properties: { data: [], error: null } })
    await listPropertiesForPortalFeed(client as never, 't1')
    const select = String(calls.find((c) => c.method === 'select')?.args[0])
    for (const col of ['owner_name', 'owner_phone', 'location', 'broker_id', 'updated_by']) {
      expect(select).not.toMatch(new RegExp(`\\b${col}\\b`))
    }
    expect(select).not.toMatch(/^\s*\*/)
  })

  test('devolve o endereço no modelo', async () => {
    const { client } = fakeSupabase({
      properties: {
        data: [
          {
            id: 'p1', tenant_id: 't1', code: 'X', title: 'T', type: 'casa', purpose: 'venda', price: 1,
            neighborhood: 'Centro', city: 'C', state: 'MS', bedrooms: 0, suites: 0, bathrooms: 0, parking: 0,
            area: 1, high_standard: false, description: null, features: [], status: 'active', featured: false,
            created_at: '2026-01-01', updated_at: '2026-01-01',
            address_zip: '79600000', address_street: 'Rua A', address_number: '1', property_images: [],
          },
        ],
        error: null,
      },
    })
    const [p] = await listPropertiesForPortalFeed(client as never, 't1')
    expect(p).toMatchObject({ addressZip: '79600000', addressStreet: 'Rua A', addressNumber: '1' })
  })
})

describe('feedTokenMatches', () => {
  test('confere o token do tenant do host, e só dele', async () => {
    const { client, calls } = fakeSupabase({ portal_feeds: { data: { token: TOKEN }, error: null } })
    expect(await feedTokenMatches(client as never, 't1', TOKEN)).toBe(true)
    expect(calls.filter((c) => c.method === 'eq').map((c) => c.args)).toContainEqual(['tenant_id', 't1'])
  })

  test('token errado, vazio ou tenant sem feed não abre', async () => {
    const com = () => fakeSupabase({ portal_feeds: { data: { token: TOKEN }, error: null } }).client as never
    expect(await feedTokenMatches(com(), 't1', 'b'.repeat(32))).toBe(false)
    expect(await feedTokenMatches(com(), 't1', '')).toBe(false)
    expect(await feedTokenMatches(com(), 't1', TOKEN.slice(1))).toBe(false)
    const sem = fakeSupabase({ portal_feeds: { data: null, error: null } }).client as never
    expect(await feedTokenMatches(sem, 't1', TOKEN)).toBe(false)
  })
})

describe('getOrCreateFeedToken', () => {
  test('reaproveita o token existente sem gravar', async () => {
    const { client, calls } = fakeSupabase({ portal_feeds: { data: { token: TOKEN }, error: null } })
    expect(await getOrCreateFeedToken(client as never, 't1')).toBe(TOKEN)
    expect(calls.some((c) => c.method === 'upsert')).toBe(false)
  })

  // Trocar o token de quem já colou o link no Canal Pro derrubaria a
  // integração sem aviso: a criação nunca sobrescreve.
  test('cria sem sobrescrever e devolve o que ficou gravado', async () => {
    const { client, calls } = fakeSupabase({
      portal_feeds: [
        { data: null, error: null },
        { data: null, error: null },
        { data: { token: TOKEN }, error: null },
      ],
    })
    expect(await getOrCreateFeedToken(client as never, 't1')).toBe(TOKEN)
    const upsert = calls.find((c) => c.method === 'upsert')
    expect(upsert?.args[0]).toMatchObject({ tenant_id: 't1' })
    expect(String((upsert?.args[0] as { token: string }).token).length).toBeGreaterThanOrEqual(32)
    expect(upsert?.args[1]).toMatchObject({ onConflict: 'tenant_id', ignoreDuplicates: true })
  })
})
