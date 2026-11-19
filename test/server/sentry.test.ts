import { describe, expect, test, vi } from 'vitest'
import { lerDsn, limparTexto, montarEvento, reportar } from '~~/server/utils/sentry'

/**
 * O que pode chegar ao Sentry. A ameaça: o erro do banco ou do e-mail cita o valor da linha
 * ("duplicate key ... (email)=(maria@x.com)"), e a política de privacidade promete que isso não sai.
 */
describe('limparTexto', () => {
  test.each([
    ['maria@olmiimoveis.com.br falhou', 'maria@olmiimoveis.com.br'],
    ['cpf 123.456.789-09 inválido', '123.456.789-09'],
    ['cpf 12345678909', '12345678909'],
    ['cnpj 12.345.678/0001-95', '12.345.678/0001-95'],
    ['tel (67) 99999-1234 e +55 67 3321-1234', '99999-1234'],
    ['Authorization: Bearer abc.def-ghi_123', 'abc.def-ghi_123'],
    ['jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abcDEF123', 'eyJhbGci'],
  ])('%s', (entrada, vazou) => {
    expect(limparTexto(entrada)).not.toContain(vazou)
  })

  test('texto técnico comum passa intacto', () => {
    expect(limparTexto('relation "gestao_vendas" does not exist')).toBe('relation "gestao_vendas" does not exist')
  })
})

describe('montarEvento', () => {
  const amb = { ambiente: 'production', release: 'abc' }

  test('não leva usuário, requisição, IP nem servidor, e limpa o detalhe', () => {
    const e = montarEvento({ nivel: 'error', evento: 'lead.falhou', mensagem: 'dup (email)=(a@b.com)', tags: { tenant: 'olmi' }, detalhe: { reason: 'tel 67999991234', aninhado: { mail: 'x@y.com' } } }, amb)
    const json = JSON.stringify(e)
    expect(json).not.toMatch(/a@b\.com|x@y\.com|67999991234/)
    for (const k of ['user', 'request', 'server_name', 'sdk']) expect(e).not.toHaveProperty(k)
    expect(e.tags).toEqual({ evento: 'lead.falhou', tenant: 'olmi' })
  })

  test('agrupa por evento e código, não pela mensagem', () => {
    const a = montarEvento({ nivel: 'error', evento: 'request.failed', mensagem: 'um', tags: { errorCode: '23505' } }, amb)
    const b = montarEvento({ nivel: 'error', evento: 'request.failed', mensagem: 'outro', tags: { errorCode: '23505' } }, amb)
    expect(a.fingerprint).toEqual(b.fingerprint)
  })

  test('exceção leva a stack, com o e-mail da mensagem removido', () => {
    const e = montarEvento({ nivel: 'error', evento: 'request.failed', mensagem: '', erro: new Error('falhou para maria@x.com') }, amb)
    expect(e.exception?.values[0]?.value).not.toContain('maria@x.com')
    expect(e.exception?.values[0]?.stacktrace?.frames.length).toBeGreaterThan(0)
  })
})

describe('reportar', () => {
  test('DSN inválida ou ausente não faz requisição', () => {
    const fetch = vi.fn()
    reportar({ nivel: 'error', evento: 'x', mensagem: '' }, { dsn: '', fetch })
    reportar({ nivel: 'error', evento: 'x', mensagem: '' }, { dsn: 'http://k@h/1', fetch })
    expect(fetch).not.toHaveBeenCalled()
    expect(lerDsn('https://k@o1.ingest.sentry.io/42')).toEqual({ chave: 'k', host: 'o1.ingest.sentry.io', projeto: '42' })
  })

  test('com DSN, manda o envelope ao host dela e falha de rede não vaza exceção', () => {
    const fetch = vi.fn().mockRejectedValue(new Error('rede'))
    expect(() => reportar({ nivel: 'error', evento: 'x', mensagem: 'm' }, { dsn: 'https://k@o1.ingest.sentry.io/42', fetch })).not.toThrow()
    const [url, init] = fetch.mock.calls[0]!
    expect(url).toBe('https://o1.ingest.sentry.io/api/42/envelope/?sentry_key=k&sentry_version=7')
    expect(String(init.body).split('\n')).toHaveLength(3)
  })
})
