import { describe, expect, test } from 'vitest'
import { avisoDeContraste, contrasteComBranco } from '~~/shared/utils/contrast'

/**
 * A cor da marca vira fundo de texto branco no site todo.
 *
 * ⚠️ O risco é o aviso errado: calar diante de um amarelo ilegível, ou
 * reclamar do verde-escuro padrão e ensinar o cliente a ignorar o aviso.
 */
describe('contrasteComBranco', () => {
  test('preto e branco dão os extremos da escala', () => {
    expect(contrasteComBranco('#000000')).toBeCloseTo(21, 0)
    expect(contrasteComBranco('#ffffff')).toBeCloseTo(1, 5)
  })

  test('aceita hex curto', () => {
    expect(contrasteComBranco('#000')).toBeCloseTo(21, 0)
  })

  test('valor que não é hex não é medido', () => {
    expect(contrasteComBranco('verde')).toBeNull()
  })
})

describe('avisoDeContraste', () => {
  test('as cores padrão do produto passam sem aviso', () => {
    expect(avisoDeContraste('#0f3d38')).toBeNull() // --brand
    expect(avisoDeContraste('#c2410c')).toBeNull() // --accent
  })

  test('amarelo e verde-claro avisam', () => {
    expect(avisoDeContraste('#facc15')).toMatch(/difícil de ler/)
    expect(avisoDeContraste('#25d366')).toMatch(/difícil de ler/) // verde do logo do WhatsApp
  })

  test('campo vazio não avisa — vazio usa o padrão', () => {
    expect(avisoDeContraste('')).toBeNull()
    expect(avisoDeContraste(null)).toBeNull()
  })
})
