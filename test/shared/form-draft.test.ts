import { describe, expect, test } from 'vitest'
import { DRAFT_TTL_MS, draftKey, parseDraft, serializeDraft } from '~~/shared/utils/form-draft'

/**
 * Rascunho do cadastro de imóvel, guardado no aparelho.
 *
 * ⚠️ O risco é o rascunho que volta errado: o de OUTRA imobiliária aparecendo
 * (mesmo aparelho, duas contas), um velho de semanas restaurado por cima de um
 * cadastro novo, ou um JSON corrompido derrubando a tela de cadastro.
 */
describe('form-draft', () => {
  test('a chave separa imobiliárias no mesmo aparelho', () => {
    expect(draftKey('a', 'imovel-novo')).not.toBe(draftKey('b', 'imovel-novo'))
  })

  test('ida e volta preserva os dados', () => {
    const now = 1_000_000
    const d = parseDraft<{ code: string }>(serializeDraft({ code: 'NC-1' }, now), now + 1000)
    expect(d?.data).toEqual({ code: 'NC-1' })
  })

  test('rascunho vencido não volta', () => {
    const now = 1_000_000
    expect(parseDraft(serializeDraft({}, now), now + DRAFT_TTL_MS + 1)).toBeNull()
  })

  test('conteúdo corrompido não derruba a tela', () => {
    expect(parseDraft('{nao é json')).toBeNull()
    expect(parseDraft('{"data":1}')).toBeNull()
    expect(parseDraft(null)).toBeNull()
  })
})
