import { describe, expect, test } from 'vitest'
import {
  areaRangeError,
  priceRangeError,
  roomsRangeError,
} from '~~/shared/utils/property-limits'

describe('priceRangeError', () => {
  // Os dois imóveis que estão hoje na vitrine de um cliente real. Um terreno de
  // 240 m² anunciado por R$ 240 milhões não é problema de formatação: é o
  // cadastro tendo aceitado três zeros a mais sem dizer nada.
  test('recusa o preço com zeros sobrando', () => {
    expect(priceRangeError(240_000_000, 'venda')).toMatch(/sobrou um zero/)
    expect(priceRangeError(440_000_000, 'venda')).toMatch(/sobrou um zero/)
  })

  // O contrário do que o relatório de auditoria propunha (dividir por mil na
  // exibição): ali uma mansão legítima de nove dígitos passaria a ser anunciada
  // por um milésimo do valor. Aqui ela passa.
  test('não atrapalha imóvel de alto padrão legítimo', () => {
    expect(priceRangeError(50_000_000, 'venda')).toBeNull()
    expect(priceRangeError(199_999_999, 'venda')).toBeNull()
  })

  test('preço comum passa', () => {
    expect(priceRangeError(240_000, 'venda')).toBeNull()
    expect(priceRangeError(1_850, 'aluguel')).toBeNull()
  })

  // O teto do aluguel é outro: valor de venda digitado no campo de aluguel é o
  // engano que se quer pegar, e ele fica muito abaixo do teto de venda.
  test('aluguel tem teto próprio', () => {
    expect(priceRangeError(2_000_000, 'aluguel')).toMatch(/aluguel/)
    expect(priceRangeError(2_000_000, 'venda')).toBeNull()
  })
})

describe('areaRangeError', () => {
  test('área de rancho e chácara cabe', () => {
    expect(areaRangeError(500_000)).toBeNull()
  })

  test('acima de 100 hectares pede conferência', () => {
    expect(areaRangeError(5_000_000)).toMatch(/Área acima/)
  })
})

describe('roomsRangeError', () => {
  // Em produção há um terreno cadastrado com `suites: 400` — é a metragem
  // digitada no campo de suítes.
  test('pega a metragem digitada no campo de cômodo', () => {
    expect(roomsRangeError(400, 'Suítes')).toMatch(/não parece certo/)
  })

  test('imóvel grande de verdade passa', () => {
    expect(roomsRangeError(12, 'Quartos')).toBeNull()
    expect(roomsRangeError(50, 'Vagas')).toBeNull()
  })
})
