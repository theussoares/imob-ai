import { describe, expect, test } from 'vitest'
import { tenantSlugForHost } from '~~/server/utils/tenant'

const PLATFORM = 'usemoradi.com.br'

/**
 * A função de produção, não uma cópia dela. A primeira versão deste teste
 * montava o "tira o painel. e deriva o slug" aqui dentro — e teria continuado
 * verde se a correção fosse revertida, porque estaria testando o próprio
 * helper do teste.
 */
const slugDoHost = (hostname: string) => tenantSlugForHost(hostname, PLATFORM)

describe('slug a partir do host do painel', () => {
  test('painel.<slug>.<platform> resolve para o slug, não para "painel"', () => {
    // O bug: `subdomainSlug` pega o primeiro rótulo, que aqui é "painel".
    // getTenantBySlug('painel') não é tenant de ninguém e o painel não abria.
    //
    // Passou despercebido porque o passo 3 (tirar o prefixo e buscar o
    // domínio-base em tenant_domains) cobre o caso quando esse domínio está
    // cadastrado — e três dos quatro tenants têm. `tres-lagoas` não tem.
    expect(slugDoHost('painel.tres-lagoas.usemoradi.com.br')).toBe('tres-lagoas')
    expect(slugDoHost('painel.demo.usemoradi.com.br')).toBe('demo')
  })

  test('host de site continua resolvendo como antes', () => {
    expect(slugDoHost('tres-lagoas.usemoradi.com.br')).toBe('tres-lagoas')
    expect(slugDoHost('demo.usemoradi.com.br')).toBe('demo')
  })

  test('domínio próprio não vira slug', () => {
    // Domínio de cliente é resolvido pelos passos 1 a 3, nunca por subdomínio:
    // devolver "painel" ou "www" aqui buscaria um tenant que não existe.
    expect(slugDoHost('painel.imoveis3lagoas.com.br')).toBeNull()
    expect(slugDoHost('imoveis3lagoas.com.br')).toBeNull()
  })

  test('subdomínio de desenvolvimento segue valendo', () => {
    expect(slugDoHost('painel.tres-lagoas.localhost')).toBe('tres-lagoas')
    expect(slugDoHost('tres-lagoas.localhost')).toBe('tres-lagoas')
  })

  test('o domínio-raiz da plataforma não é tenant', () => {
    expect(slugDoHost('usemoradi.com.br')).toBeNull()
  })
})
