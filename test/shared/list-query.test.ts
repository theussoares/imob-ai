import { describe, expect, test } from 'vitest'
import { readListQuery, writeListQuery } from '~~/shared/utils/list-query'

/**
 * Filtros das listas do painel na URL.
 *
 * ⚠️ O risco é a lista que aparece vazia sem motivo visível: um link com
 * status inexistente filtrando tudo para fora, ou uma chave estranha na URL
 * virando filtro.
 */
const KEYS = ['q', 'status'] as const

describe('list-query', () => {
  test('lê só as chaves conhecidas', () => {
    expect(readListQuery({ q: 'centro', utm_source: 'x' }, KEYS)).toEqual({ q: 'centro' })
  })

  test('valor fora da lista fechada vira "todos"', () => {
    expect(readListQuery({ status: 'apagado' }, KEYS, { status: ['active', 'draft'] })).toEqual({})
    expect(readListQuery({ status: 'draft' }, KEYS, { status: ['active', 'draft'] })).toEqual({ status: 'draft' })
  })

  test('vazio não vai para a URL', () => {
    expect(writeListQuery({ q: '  ', status: 'active' }, KEYS)).toEqual({ status: 'active' })
  })

  test('ida e volta preserva', () => {
    const f = { q: 'NC-0231', status: 'draft' }
    expect(readListQuery(writeListQuery(f, KEYS), KEYS)).toEqual(f)
  })
})
