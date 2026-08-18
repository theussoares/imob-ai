import { describe, expect, test } from 'vitest'
import { parsePriceInput } from '~~/shared/utils/price'

describe('parsePriceInput', () => {
  test('lê o número digitado', () => {
    expect(parsePriceInput('350000')).toBe(350000)
  })

  test('ignora a máscara que o próprio campo escreve', () => {
    expect(parsePriceInput('R$ 350.000')).toBe(350000)
  })

  test('descarta os centavos em vez de somá-los ao valor', () => {
    // O bug que isto corrige: `replace(/\D/g, '')` apagava a vírgula e
    // absorvia os centavos como reais — 350000,50 virava R$ 35.000.050, cem
    // vezes o valor, sem aviso nenhum.
    expect(parsePriceInput('350000,50')).toBe(350000)
    expect(parsePriceInput('350.000,50')).toBe(350000)
  })

  test('trata ponto como separador de milhar, não decimal', () => {
    expect(parsePriceInput('350.000')).toBe(350000)
    expect(parsePriceInput('1.250.000')).toBe(1250000)
  })

  test('entende ponto com dois dígitos no fim como centavos', () => {
    // Teclado numérico de notebook não tem vírgula; quem digita 350000.50 quer
    // dizer centavos, não um milhar de dois dígitos (que não existe).
    expect(parsePriceInput('350000.50')).toBe(350000)
    expect(parsePriceInput('1.50')).toBe(1)
  })

  test('vazio e lixo viram zero', () => {
    expect(parsePriceInput('')).toBe(0)
    expect(parsePriceInput('abc')).toBe(0)
    expect(parsePriceInput('R$ ')).toBe(0)
  })

  test('vírgula sozinha no fim ainda não é centavo', () => {
    // Estado intermediário: a pessoa digitou a vírgula e vai digitar o centavo.
    // O valor em reais não pode mudar por causa disso.
    expect(parsePriceInput('350000,')).toBe(350000)
  })
})
