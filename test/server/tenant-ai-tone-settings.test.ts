import { describe, expect, test } from 'vitest'
import { assertTenantSettingsInput } from '~~/server/utils/validate'
import { toTenantUpdateRow } from '~~/server/mappers/tenant.mapper'
import { AI_TONES } from '~~/shared/models/ai-tone'

describe('assertTenantSettingsInput · aiTone', () => {
  // `tenant.put.ts` grava com o client do usuário (papel `authenticated`), não
  // com a service_role — a `check` do banco existe, mas devolveria um erro cru
  // do Postgres em vez de mensagem legível na tela de configurações.
  test('recusa tom fora da lista fechada', () => {
    expect(() => assertTenantSettingsInput({ aiTone: 'agressivo' })).toThrow(
      expect.objectContaining({ statusCode: 422 }),
    )
  })

  test('aceita os três tons válidos', () => {
    for (const tom of AI_TONES) {
      expect(() => assertTenantSettingsInput({ aiTone: tom })).not.toThrow()
    }
  })

  test('aiTone ausente não é erro — a tela pode salvar outra seção sem declarar o tom', () => {
    expect(() => assertTenantSettingsInput({ name: 'Imóveis Exemplo' })).not.toThrow()
  })
})

describe('toTenantUpdateRow · aiTone', () => {
  test('mapeia aiTone para ai_tone quando presente', () => {
    const row = toTenantUpdateRow({ aiTone: 'caloroso' })
    expect(row.ai_tone).toBe('caloroso')
  })

  // Este é o teste que protege o incidente do desenho original da task: se
  // `aiTone` nascesse no formulário de OUTRA seção (sempre 'sobrio', porque o
  // formulário parte do payload público, que não carrega o tom), salvar essa
  // seção reescreveria o tom de todo mundo em silêncio. `undefined` não pode
  // virar a chave `ai_tone` no update parcial do PostgREST.
  test('não produz a chave ai_tone quando aiTone não foi informado', () => {
    const row = toTenantUpdateRow({})
    expect('ai_tone' in row).toBe(false)
  })
})
