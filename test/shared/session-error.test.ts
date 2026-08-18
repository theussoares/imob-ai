import { describe, expect, test } from 'vitest'
import { isSessionExpiredError } from '~~/shared/utils/session-error'

describe('isSessionExpiredError', () => {
  // O ofetch expõe o status em mais de um lugar conforme como o erro é
  // capturado. Reconhecer só um dos formatos deixaria o aviso mudo justamente
  // no caso que ele existe para cobrir.
  test('reconhece 401 em statusCode', () => {
    expect(isSessionExpiredError({ statusCode: 401 })).toBe(true)
  })

  test('reconhece 401 em status', () => {
    expect(isSessionExpiredError({ status: 401 })).toBe(true)
  })

  test('reconhece 401 em response.status', () => {
    expect(isSessionExpiredError({ response: { status: 401 } })).toBe(true)
  })

  test('NÃO trata 403 como sessão expirada', () => {
    // 403 é "você está logada, mas não é membro desta imobiliária". Mandar a
    // pessoa relogar não resolveria nada e esconderia o problema real.
    expect(isSessionExpiredError({ statusCode: 403 })).toBe(false)
  })

  test('ignora erros que não são de autenticação', () => {
    expect(isSessionExpiredError({ statusCode: 409 })).toBe(false)
    expect(isSessionExpiredError({ statusCode: 500 })).toBe(false)
  })

  test('tolera qualquer coisa vinda do catch', () => {
    expect(isSessionExpiredError(null)).toBe(false)
    expect(isSessionExpiredError(undefined)).toBe(false)
    expect(isSessionExpiredError('erro de rede')).toBe(false)
    expect(isSessionExpiredError(new Error('falhou'))).toBe(false)
  })
})
