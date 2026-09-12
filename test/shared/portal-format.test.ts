import { describe, expect, test } from 'vitest'
import {
  contractPeriodLabel,
  dueDayLabel,
  formatBRL,
  formatDateBR,
} from '~~/shared/utils/portal-format'

describe('formatBRL', () => {
  test('formata em reais sem centavos', () => {
    expect(formatBRL(2400)).toMatch(/R\$\s?2\.400/)
  })

  test('valor ausente vira travessão, não "R$ 0" nem "NaN"', () => {
    // Aluguel zerado e aluguel não informado são coisas diferentes, e mostrar
    // "R$ 0" para o segundo faz a pessoa achar que o contrato está errado.
    expect(formatBRL(null)).toBe('—')
    expect(formatBRL(undefined)).toBe('—')
    expect(formatBRL(Number.NaN)).toBe('—')
  })

  test('zero continua sendo zero', () => {
    expect(formatBRL(0)).toMatch(/R\$\s?0/)
  })
})

describe('formatDateBR', () => {
  test('converte ISO para dd/mm/aaaa', () => {
    expect(formatDateBR('2026-03-01')).toBe('01/03/2026')
  })

  test('NÃO desloca a data por fuso horário', () => {
    // Este é o teste que dá razão à função existir. `new Date('2026-03-01')` é
    // meia-noite UTC, que no Brasil (UTC-3) é 21h do dia 28/02 — e o vencimento
    // apareceria um dia antes. Erro que ninguém reporta, só desconfia.
    expect(formatDateBR('2026-03-01')).toBe('01/03/2026')
    expect(formatDateBR('2026-01-01')).toBe('01/01/2026')
    expect(formatDateBR('2026-12-31')).toBe('31/12/2026')
  })

  test('aceita timestamp completo, não só a data', () => {
    expect(formatDateBR('2026-09-10T12:00:00.000Z')).toBe('10/09/2026')
  })

  test('entrada vazia ou inválida vira travessão', () => {
    expect(formatDateBR(null)).toBe('—')
    expect(formatDateBR('')).toBe('—')
    expect(formatDateBR('ontem')).toBe('—')
  })
})

describe('contractPeriodLabel', () => {
  test('período completo', () => {
    expect(contractPeriodLabel('2026-03-01', '2028-02-29')).toBe('01/03/2026 a 29/02/2028')
  })

  test('sem fim: contrato vigente por prazo indeterminado', () => {
    expect(contractPeriodLabel('2026-03-01', null)).toBe('desde 01/03/2026')
  })

  test('sem início', () => {
    expect(contractPeriodLabel(null, '2028-02-29')).toBe('até 29/02/2028')
  })

  test('sem nenhuma das duas', () => {
    expect(contractPeriodLabel(null, null)).toBe('—')
  })
})

describe('dueDayLabel', () => {
  test('dia válido', () => {
    expect(dueDayLabel(10)).toBe('todo dia 10')
  })

  test('fora de 1–31 não vira texto sem sentido', () => {
    expect(dueDayLabel(0)).toBe('—')
    expect(dueDayLabel(32)).toBe('—')
    expect(dueDayLabel(null)).toBe('—')
  })
})
