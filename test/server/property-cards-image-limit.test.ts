import { describe, expect, test } from 'vitest'
import { listActivePropertyCards } from '~~/server/repositories/property.repository'
import { fakeSupabase } from '../helpers/fake-supabase'

/**
 * O carrossel do card precisa de mais de uma foto, mas sem voltar a mandar
 * TODAS as fotos do imóvel (era o problema que a otimização anterior corrigiu).
 * A query pede ao Postgrest um teto por imóvel, ordenado com a capa primeiro.
 */
describe('listActivePropertyCards — teto de fotos por imóvel', () => {
  test('limita o embed de property_images a 5 por imóvel', async () => {
    const { client, calls } = fakeSupabase({
      properties: { data: [], error: null },
    })

    await listActivePropertyCards(client, 't1')

    const limit = calls.find((c) => c.table === 'properties' && c.method === 'limit')
    expect(limit?.args).toEqual([5, { referencedTable: 'property_images' }])
  })

  test('ordena o embed com a capa primeiro, depois por posição', async () => {
    const { client, calls } = fakeSupabase({
      properties: { data: [], error: null },
    })

    await listActivePropertyCards(client, 't1')

    const orders = calls.filter((c) => c.table === 'properties' && c.method === 'order')
    const embedOrders = orders.filter(
      (c) => (c.args[1] as { referencedTable?: string } | undefined)?.referencedTable === 'property_images',
    )
    expect(embedOrders.map((c) => c.args[0])).toEqual(['is_cover', 'position'])
  })
})
