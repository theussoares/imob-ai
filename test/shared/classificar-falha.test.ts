import { describe, expect, test } from 'vitest'
import { classificarFalha, MENSAGEM_DE_FALHA } from '~~/shared/utils/session-error'

describe('classificarFalha', () => {
  test('sem status é falha de REDE, não erro de servidor', () => {
    // O caso mais comum no celular, que é onde o portal é usado: o fetch nem
    // chegou ao servidor. É o único em que "tente de novo" é conselho útil, e
    // tratá-lo como erro genérico faz a pessoa desistir achando que quebrou.
    expect(classificarFalha(new TypeError('Failed to fetch'))).toBe('rede')
    expect(classificarFalha({})).toBe('rede')
  })

  test('401 é sessão, em qualquer formato que o ofetch entregue', () => {
    expect(classificarFalha({ statusCode: 401 })).toBe('sessao')
    expect(classificarFalha({ status: 401 })).toBe('sessao')
    expect(classificarFalha({ response: { status: 401 } })).toBe('sessao')
  })

  test('403 é permissão e NÃO manda relogar', () => {
    // Relogar não resolve "está logada, mas não pode ver isto" — e esconderia o
    // problema de verdade.
    expect(classificarFalha({ statusCode: 403 })).toBe('permissao')
    expect(MENSAGEM_DE_FALHA.permissao).not.toMatch(/entre novamente|sess/i)
  })

  test('404 é não encontrado', () => {
    expect(classificarFalha({ statusCode: 404 })).toBe('nao_encontrado')
  })

  test('5xx é servidor', () => {
    expect(classificarFalha({ statusCode: 500 })).toBe('servidor')
    expect(classificarFalha({ statusCode: 502 })).toBe('servidor')
  })

  test('valor que não é objeto não vira "rede" por engano', () => {
    // `null` e string não são falha de conexão — são erro inesperado, e mandar
    // conferir a internet nesse caso é conselho errado.
    expect(classificarFalha(null)).toBe('servidor')
    expect(classificarFalha('deu ruim')).toBe('servidor')
  })

  test('toda falha tem frase, e nenhuma é o genérico de sempre', () => {
    const frases = Object.values(MENSAGEM_DE_FALHA)
    expect(frases.length).toBe(5)
    for (const f of frases) {
      expect(f.length).toBeGreaterThan(20)
      expect(f).not.toBe('Não foi possível carregar.')
    }
    // Cada tipo diz algo diferente — senão a classificação não serviu para nada.
    expect(new Set(frases).size).toBe(frases.length)
  })

  test('só a falha de rede fala em conexão', () => {
    expect(MENSAGEM_DE_FALHA.rede.toLowerCase()).toContain('conexão')
    for (const tipo of ['sessao', 'permissao', 'nao_encontrado', 'servidor'] as const) {
      expect(MENSAGEM_DE_FALHA[tipo].toLowerCase()).not.toContain('conexão')
    }
  })
})
