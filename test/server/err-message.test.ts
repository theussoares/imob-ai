import { describe, expect, test } from 'vitest'
import { errMessage } from '~~/server/utils/log'

describe('errMessage', () => {
  test('erro do Supabase (objeto com message) mantém a mensagem', () => {
    // O PostgrestError não é `instanceof Error`. Antes, "relation does not
    // exist" chegava ao log como "erro desconhecido" — foi assim que a falta
    // da migration 0046 apareceu no primeiro teste do clique no WhatsApp.
    const pgErr = { message: 'relation "public.whatsapp_clicks" does not exist', details: 'linha: Maria', code: '42P01' }
    expect(errMessage(pgErr)).toBe('relation "public.whatsapp_clicks" does not exist')
  })

  test('não arrasta details/hint, que podem trazer dado da linha', () => {
    expect(errMessage({ message: 'x', details: 'Maria (67) 9...' })).not.toContain('Maria')
  })

  test('Error, string e o resto', () => {
    expect(errMessage(new Error('boom'))).toBe('boom')
    expect(errMessage('texto')).toBe('texto')
    expect(errMessage(42)).toBe('erro desconhecido')
    expect(errMessage({ message: 1 })).toBe('erro desconhecido')
  })
})
