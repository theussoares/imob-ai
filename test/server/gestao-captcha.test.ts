import { describe, expect, test, vi } from 'vitest'
import { verificarCaptcha } from '~~/server/utils/gestao-captcha'

const resposta = (corpo: unknown, ok = true) => ({ ok, json: async () => corpo }) as Response

describe('captcha do /gestao (Turnstile siteverify)', () => {
  test('token aceito pela Cloudflare passa, e vai com secret, token e IP', async () => {
    const f = vi.fn(async () => resposta({ success: true }))
    expect(await verificarCaptcha('segredo', 'tok', '203.0.113.9', { fetch: f as never })).toBe('ok')
    const [url, init] = f.mock.calls[0] as unknown as [string, { body: URLSearchParams }]
    expect(url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify')
    expect(Object.fromEntries(init.body)).toEqual({ secret: 'segredo', response: 'tok', remoteip: '203.0.113.9' })
  })

  test('token recusado, vazio ou o falso do demo não passa (e o vazio nem consulta a Cloudflare)', async () => {
    const recusa = vi.fn(async () => resposta({ success: false, 'error-codes': ['invalid-input-response'] }))
    expect(await verificarCaptcha('s', 'demo-0011223344556677', null, { fetch: recusa as never })).toBe('invalido')
    const nunca = vi.fn()
    expect(await verificarCaptcha('s', '', null, { fetch: nunca as never })).toBe('invalido')
    expect(await verificarCaptcha('s', 'x'.repeat(3000), null, { fetch: nunca as never })).toBe('invalido')
    expect(nunca).not.toHaveBeenCalled()
  })

  test('Cloudflare fora do ar (rede, HTTP 5xx) é «indisponível», e não «inválido»: o login não tranca por isso', async () => {
    expect(await verificarCaptcha('s', 't', null, { fetch: (async () => { throw new Error('rede') }) as never })).toBe('indisponivel')
    expect(await verificarCaptcha('s', 't', null, { fetch: (async () => resposta({}, false)) as never })).toBe('indisponivel')
  })
})
