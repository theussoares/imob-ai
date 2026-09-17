import { describe, expect, test } from 'vitest'
import { adminHostAction } from '~~/server/utils/admin-host'

const PAINEL = 'painel.olmi.com.br'
const PUBLICO = 'olmi.com.br'

describe('adminHostAction', () => {
  test('host público não é tocado', () => {
    expect(adminHostAction(PUBLICO, '/imoveis/casa').kind).toBe('passa')
    expect(adminHostAction(PUBLICO, '/area-cliente').kind).toBe('passa')
  })

  test('rota pública no host do painel vai para /admin', () => {
    expect(adminHostAction(PAINEL, '/imoveis/casa').kind).toBe('admin')
    expect(adminHostAction(PAINEL, '/').kind).toBe('admin')
  })

  test('infra do painel passa direto', () => {
    // Sem esta lista o painel não carrega: ele é SPA e consome /api/admin/* e
    // /_nuxt/*.
    for (const p of ['/admin', '/admin/imoveis', '/api/admin/properties', '/_nuxt/x.js', '/favicon.ico', '/robots.txt']) {
      expect(adminHostAction(PAINEL, p).kind).toBe('passa')
    }
  })

  test('a área do cliente vai para o domínio público, não para /admin', () => {
    // Mandar para /admin colocaria o inquilino na tela de login da imobiliária,
    // onde a senha dele não funciona.
    const acao = adminHostAction(PAINEL, '/area-cliente')
    expect(acao).toEqual({ kind: 'portal', hostPublico: PUBLICO, destino: '/area-cliente' })
  })

  test('preserva a query, onde vem o token do convite', () => {
    // Perder a query transforma "definir senha" em "link inválido".
    const acao = adminHostAction(PAINEL, '/area-cliente/definir-senha?code=abc123')
    expect(acao).toEqual({
      kind: 'portal',
      hostPublico: PUBLICO,
      destino: '/area-cliente/definir-senha?code=abc123',
    })
  })

  test('NÃO devolve URL pronta — o host ainda precisa ser validado', () => {
    // O host sai de X-Forwarded-Host, que é dado do cliente. Se esta função
    // montasse a URL, o middleware emitiria um destino absoluto escolhido por
    // quem forjou o header — levando junto o token que vai na query.
    const acao = adminHostAction('painel.atacante.tld', '/area-cliente?code=x')
    expect(acao).not.toHaveProperty('url')
    expect(acao).toMatchObject({ kind: 'portal', hostPublico: 'atacante.tld' })
  })

  test('não confunde um caminho que só começa parecido', () => {
    // `/area-clientes-vip` não é a área do cliente, e mandá-lo ao domínio
    // público criaria um redirect que ninguém pediu.
    expect(adminHostAction(PAINEL, '/area-clientes-vip').kind).toBe('admin')
  })
})
