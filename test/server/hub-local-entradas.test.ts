import { afterEach, describe, expect, test, vi } from 'vitest'
import { buildLlmsTxt } from '~~/server/utils/markdown'
import type { Tenant } from '~~/shared/models/tenant'

/**
 * O hub só ajuda se o rastreador o encontra: sitemap e llms.txt precisam
 * listá-lo — e só quando a rota responde 200. URL no sitemap que dá 404 é
 * pedir indexação do que não existe.
 */

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
  vi.doUnmock('~~/server/repositories/property.repository')
})

async function sitemap(city: string | null) {
  vi.doMock('~~/server/repositories/property.repository', () => ({ listActiveProperties: async () => [] }))
  vi.stubGlobal('defineEventHandler', (h: unknown) => h)
  vi.stubGlobal('getRequestURL', () => new URL('https://olmi.com.br/sitemap.xml'))
  vi.stubGlobal('setHeader', () => {})
  vi.stubGlobal('useTenantContext', () => ({ id: 't1', city }))
  vi.stubGlobal('cached', async (_k: string, fn: () => unknown) => fn())
  vi.stubGlobal('tenantCacheKey', (a: string, b: string) => `${a}:${b}`)
  vi.stubGlobal('publicSupabase', () => ({}))
  const h = (await import('~~/server/routes/sitemap.xml.get')).default as unknown as (e: unknown) => Promise<string>
  return h({ context: {} })
}

describe('sitemap', () => {
  test('com cidade: o hub entra, no caminho que a rota aceita', async () => {
    expect(await sitemap('Três Lagoas')).toContain('<loc>https://olmi.com.br/imobiliaria-tres-lagoas</loc>')
  })

  test('sem cidade: não há hub, então nada de URL que dá 404', async () => {
    expect(await sitemap(null)).not.toContain('imobiliaria-')
    expect(await sitemap('  ')).not.toContain('imobiliaria-')
  })
})

describe('llms.txt', () => {
  const tenant = { name: 'OLMI', city: 'Três Lagoas', state: 'MS', heroSubtitle: null, tagline: null } as unknown as Tenant

  test('lista o hub entre os recursos', () => {
    expect(buildLlmsTxt(tenant, [], 'https://olmi.com.br')).toContain('(https://olmi.com.br/imobiliaria-tres-lagoas)')
  })

  test('sem cidade, não lista', () => {
    expect(buildLlmsTxt({ ...tenant, city: null } as unknown as Tenant, [], 'https://x.com')).not.toContain('imobiliaria-')
  })
})
