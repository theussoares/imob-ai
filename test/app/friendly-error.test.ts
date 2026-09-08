import { describe, expect, test } from 'vitest'
import { friendlyErrorMessage } from '~~/app/utils/friendly-error'

describe('friendlyErrorMessage', () => {
  test('traduz violação de row-level security', () => {
    expect(friendlyErrorMessage(new Error('new row violates row-level security policy for table "objects"'))).toBe(
      'Você não tem permissão para fazer isso agora. Atualize a página e tente de novo.',
    )
  })

  test('traduz sessão/token expirado', () => {
    expect(friendlyErrorMessage({ message: 'JWT expired' })).toBe('Sua sessão expirou. Atualize a página e entre novamente.')
  })

  test('traduz falha de rede', () => {
    expect(friendlyErrorMessage(new TypeError('Failed to fetch'))).toBe(
      'Falha de conexão. Verifique sua internet e tente novamente.',
    )
  })

  test('traduz arquivo grande demais', () => {
    expect(friendlyErrorMessage({ message: 'The object exceeded the maximum allowed size' })).toBe(
      'Arquivo muito grande. Tente uma imagem menor.',
    )
  })

  test('traduz credenciais inválidas', () => {
    expect(friendlyErrorMessage({ message: 'Invalid login credentials' })).toBe('E-mail ou senha incorretos.')
  })

  test('erro não reconhecido cai no fallback, nunca na frase crua', () => {
    expect(friendlyErrorMessage(new Error('duplicate key value violates unique constraint "properties_code_key"'))).toBe(
      'Não foi possível concluir. Tente novamente.',
    )
  })

  test('aceita fallback customizado', () => {
    expect(friendlyErrorMessage(new Error('algo obscuro'), 'Não foi possível enviar a imagem. Tente novamente.')).toBe(
      'Não foi possível enviar a imagem. Tente novamente.',
    )
  })

  test('tolera entrada sem mensagem', () => {
    expect(friendlyErrorMessage(null)).toBe('Não foi possível concluir. Tente novamente.')
    expect(friendlyErrorMessage(undefined)).toBe('Não foi possível concluir. Tente novamente.')
    expect(friendlyErrorMessage('string qualquer')).toBe('Não foi possível concluir. Tente novamente.')
  })
})
