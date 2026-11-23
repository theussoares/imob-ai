import { describe, expect, it } from 'vitest'
import { mascararMoeda, MAX_DIGITOS_MOEDA, valorDeColagemMoeda, valorDeTextoMoeda } from '../../domain/moeda'

// O campo de dinheiro trocou `type="number"` por máscara de centavos: o número
// nativo aceitava «e» e «-», mudava com a rodinha do mouse e não mostrava milhar.
describe('máscara de moeda (caixa registradora)', () => {
  it('digitação vira centavos e a vírgula anda sozinha', () => {
    expect(valorDeTextoMoeda('1')).toBe(0.01)
    expect(valorDeTextoMoeda('12')).toBe(0.12)
    expect(valorDeTextoMoeda('12345')).toBe(123.45)
    expect(valorDeTextoMoeda('32000000')).toBe(320000)
  })

  it('reformatar o texto já mascarado e digitar mais um dígito empurra para a esquerda', () => {
    expect(valorDeTextoMoeda(mascararMoeda(1234.5) + '6')).toBe(12345.06)
  })

  it('apagar até o fim zera, e zeros à esquerda não contam', () => {
    expect(valorDeTextoMoeda('')).toBe(0)
    expect(valorDeTextoMoeda('0,0')).toBe(0)
    expect(valorDeTextoMoeda('000150')).toBe(1.5)
  })

  it('descarta letras, sinal e notação científica', () => {
    expect(valorDeTextoMoeda('-1e5')).toBe(0.15)
    expect(valorDeTextoMoeda('abc')).toBe(0)
  })

  it('não passa de 13 dígitos (centavos exatos em Number)', () => {
    expect(valorDeTextoMoeda('9'.repeat(MAX_DIGITOS_MOEDA + 3))).toBe(99999999999.99)
  })

  it('formata com milhar e duas casas, sem o «R$»', () => {
    expect(mascararMoeda(320000)).toBe('320.000,00')
    expect(mascararMoeda(0.5)).toBe('0,50')
    expect(mascararMoeda(1234567.891)).toBe('1.234.567,89')
  })

  it('negativo e NaN viram zero na tela (o domínio recusa negativo de qualquer jeito)', () => {
    expect(mascararMoeda(-10)).toBe('0,00')
    expect(mascararMoeda(Number.NaN)).toBe('0,00')
  })
})

// Colar «1500,5» pela regra dos centavos daria 150,05 — dez vezes menos, sem aviso.
describe('colagem de valor pronto', () => {
  it('entende vírgula decimal brasileira, com ou sem milhar e «R$»', () => {
    expect(valorDeColagemMoeda('1500,5')).toBe(1500.5)
    expect(valorDeColagemMoeda('R$ 1.500,50')).toBe(1500.5)
    expect(valorDeColagemMoeda('320.000,00')).toBe(320000)
  })

  it('entende ponto decimal (planilha/sistema em inglês)', () => {
    expect(valorDeColagemMoeda('1500.50')).toBe(1500.5)
  })

  it('número inteiro e milhar sem decimais são reais, não centavos', () => {
    expect(valorDeColagemMoeda('320000')).toBe(320000)
    expect(valorDeColagemMoeda('1.500')).toBe(1500)
    expect(valorDeColagemMoeda('1.500.000')).toBe(1500000)
  })

  it('lixo colado vira zero', () => {
    expect(valorDeColagemMoeda('abc')).toBe(0)
  })
})
