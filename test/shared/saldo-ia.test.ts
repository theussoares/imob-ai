import { describe, expect, test } from 'vitest'
import { COTA_MENSAL_DESCRICAO, saldoMensalDescricao } from '~~/shared/models/ai-generation'

/**
 * Saldo de descrições por IA mostrado ANTES de gerar.
 *
 * ⚠️ O risco é o saldo que mente: "restam -2" quando reservas concorrentes
 * passaram do teto, ou um valor inválido do banco virando "restam NaN".
 */
describe('saldoMensalDescricao', () => {
  test('desconta o que já foi usado', () => {
    expect(saldoMensalDescricao(37)).toEqual({ usadas: 37, limite: COTA_MENSAL_DESCRICAO, restantes: COTA_MENSAL_DESCRICAO - 37 })
  })

  test('acima do teto mostra zero, nunca negativo', () => {
    expect(saldoMensalDescricao(COTA_MENSAL_DESCRICAO + 3).restantes).toBe(0)
  })

  test('valor inválido conta como nada usado', () => {
    expect(saldoMensalDescricao(Number.NaN).restantes).toBe(COTA_MENSAL_DESCRICAO)
    expect(saldoMensalDescricao(-1).usadas).toBe(0)
  })
})
