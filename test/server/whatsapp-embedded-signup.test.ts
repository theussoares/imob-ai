import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { cloudApi, trocarCodigo } from '~~/server/services/whatsapp/cloud-api'
import { ErroDoWhatsapp } from '~~/server/services/whatsapp/provider'
import { stripComments } from '../helpers/strip-comments'

/**
 * Embedded Signup — o popup "Conectar com o Facebook".
 *
 * Ameaças: os ids do número e da WABA chegam pelo NAVEGADOR (a mensagem do
 * popup passa por ele), então um membro poderia trocá-los para prender o
 * número de outro cliente da Meta à imobiliária dele; o App Secret, que a
 * troca do `code` exige, ir para o navegador; e o afrouxamento da CSP e do
 * COOP que o popup pede vazar para o site público.
 */

const ler = (f: string) => stripComments(readFileSync(join(process.cwd(), f), 'utf8'))

describe('troca do code', () => {
  test('no servidor, com o App Secret, direto na Graph API', async () => {
    const urls: string[] = []
    const f = (async (url: string) => {
      urls.push(url)
      return new Response(JSON.stringify({ access_token: 'TOKEN' }))
    }) as unknown as typeof fetch
    await expect(trocarCodigo({ appId: 'APP', appSecret: 'SEGREDO', code: 'C' }, f)).resolves.toBe('TOKEN')
    const u = new URL(urls[0]!)
    expect(u.origin + u.pathname).toBe('https://graph.facebook.com/v24.0/oauth/access_token')
    expect(u.searchParams.get('client_secret')).toBe('SEGREDO')
  })

  test('code vencido ou usado vira erro de credencial, com a frase da Meta', async () => {
    const f = (async () => new Response(JSON.stringify({ error: { code: 100, message: 'This authorization code has expired.' } }), { status: 400 })) as unknown as typeof fetch
    const e = await trocarCodigo({ appId: 'A', appSecret: 'S', code: 'C' }, f).catch((x) => x)
    expect(e).toBeInstanceOf(ErroDoWhatsapp)
    expect((e as ErroDoWhatsapp).credencialInvalida).toBe(true)
  })

  test('o App Secret não existe no código do navegador', () => {
    for (const f of ['app/composables/useEmbeddedSignup.ts', 'app/pages/admin/conversas.vue']) {
      expect(ler(f)).not.toMatch(/whatsappAppSecret|client_secret|appSecret/)
    }
  })
})

describe('o número é conferido contra a conta autorizada', () => {
  const src = ler('server/api/admin/whatsapp/embedded-signup.post.ts')

  test('a WABA precisa conter o número, antes de registrar ou gravar', () => {
    const confere = src.indexOf('numeros.includes(phoneNumberId)')
    expect(confere).toBeGreaterThan(0)
    expect(confere).toBeLessThan(src.indexOf('registrarNumero('))
    expect(confere).toBeLessThan(src.indexOf('saveAccount('))
    // E o token usado para conferir é o que saiu do `code`, não um do body.
    expect(src).not.toMatch(/body\??\.(accessToken|token)/)
  })

  test('número de outra imobiliária é recusado antes de registrar na Meta', () => {
    expect(src.indexOf('jaConectado.tenantId !== tenant.id')).toBeGreaterThan(0)
    expect(src.indexOf('jaConectado.tenantId !== tenant.id')).toBeLessThan(src.indexOf('registrarNumero('))
  })

  test('só o owner conecta', () => {
    expect(src).toContain("membership.role !== 'owner'")
  })

  test('lista de números e registro vão para os caminhos certos', async () => {
    const chamadas: { url: string; body: unknown }[] = []
    const f = (async (url: string, init: RequestInit) => {
      chamadas.push({ url, body: init.body ? JSON.parse(String(init.body)) : null })
      return new Response(JSON.stringify(url.includes('phone_numbers') ? { data: [{ id: '111' }, { id: '333' }] } : { success: true }))
    }) as unknown as typeof fetch
    const api = cloudApi(f)
    const c = { phoneNumberId: '111', wabaId: '222', accessToken: 'T' }
    await expect(api.numerosDaWaba(c)).resolves.toEqual(['111', '333'])
    await api.registrarNumero(c, '123456')
    expect(chamadas[0]!.url).toContain('/222/phone_numbers')
    expect(chamadas[1]!.url).toContain('/111/register')
    expect(chamadas[1]!.body).toEqual({ messaging_product: 'whatsapp', pin: '123456' })
  })
})

describe('o popup só no painel', () => {
  const config = readFileSync(join(process.cwd(), 'nuxt.config.ts'), 'utf8')

  test('o painel usa os cabeçalhos próprios; o site continua com COOP same-origin e a CSP pública', () => {
    expect(config).toMatch(/'\/admin': \{ ssr: false, headers: CABECALHOS_DO_PAINEL \}/)
    expect(config).toMatch(/'\/admin\/\*\*': \{ ssr: false, headers: CABECALHOS_DO_PAINEL \}/)
    expect(config).toMatch(/'Cross-Origin-Opener-Policy': 'same-origin',/)
    expect(config).toContain("'Content-Security-Policy': CSP_PUBLICO.join('; ')")
  })

  test('a CSP pública não tem nada da Meta', () => {
    const semComentario = config.replace(/^\s*\/\/.*$/gm, '')
    const publica = semComentario.slice(semComentario.indexOf('const CSP_PUBLICO'), semComentario.indexOf('const EXTRAS_DO_PAINEL'))
    expect(publica).toContain('script-src')
    expect(publica).not.toMatch(/facebook/)
  })

  test('o painel só aceita a mensagem do popup vinda da Meta', () => {
    const src = ler('app/composables/useEmbeddedSignup.ts')
    expect(src).toMatch(/facebook\\\.com\$\/\.test\(origem\.hostname\)/)
    expect(src).toContain("origem.protocol !== 'https:'")
  })
})
