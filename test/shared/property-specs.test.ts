import { describe, expect, test } from 'vitest'
import {
  formatArea,
  formatPropertyCode,
  propertySpecs,
} from '~~/shared/utils/property-specs'

const casa = {
  type: 'casa' as const,
  bedrooms: 2,
  suites: 1,
  bathrooms: 2,
  parking: 3,
  area: 375,
}

/** Só os rótulos curtos, que é o que o card mostra. */
const curto = (p: Parameters<typeof propertySpecs>[0]) =>
  propertySpecs(p).map((s) => `${s.value} ${s.short}`)

describe('propertySpecs', () => {
  // O caso que motivou o componente: em produção o texto do bloco era "2 1 2 3
  // 375 m²" — número atrás de número, sem uma palavra. Quem lê por leitor de
  // tela ouvia "dois um dois três", e era isso que o Google indexava.
  test('cada medida sai com o próprio rótulo', () => {
    expect(curto(casa)).toEqual(['2 qtos', '1 suíte', '2 banhs', '3 vagas', '375 m²'])
  })

  test('a página de detalhe usa o rótulo por extenso', () => {
    expect(propertySpecs(casa).map((s) => s.long)).toEqual([
      'quartos',
      'suíte',
      'banheiros',
      'vagas',
      'm² de área',
    ])
  })

  // Zero não é medida: é medida não informada. "0 vaga" afirma que não há vaga,
  // o que o cadastro nunca disse.
  test('medida zerada some da ficha', () => {
    expect(curto({ ...casa, suites: 0, bathrooms: 0, parking: 0 })).toEqual(['2 qtos', '375 m²'])
  })

  // Renderizava "Terreno · 0 m²" em produção — a única medida que um terreno
  // precisa dar, dada errada.
  test('área zerada some, inclusive quando é a única medida', () => {
    expect(curto({ ...casa, type: 'terreno', bedrooms: 0, suites: 0, bathrooms: 0, parking: 0, area: 0 })).toEqual([])
  })

  test('terreno não anuncia quarto mesmo com o campo preenchido', () => {
    expect(curto({ ...casa, type: 'terreno', area: 300 })).toEqual(['300 m²'])
  })

  test('singular e plural', () => {
    expect(curto({ ...casa, bedrooms: 1, suites: 1, bathrooms: 1, parking: 1 })).toEqual([
      '1 qto',
      '1 suíte',
      '1 banh',
      '1 vaga',
      '375 m²',
    ])
  })
})

describe('formatArea', () => {
  test('decimal sai com vírgula, não com ponto', () => {
    // Em produção há um imóvel com area 12.27. Com ponto, lê-se "doze mil".
    expect(formatArea(12.27)).toBe('12,27')
  })

  test('milhar ganha separador', () => {
    expect(formatArea(1500)).toBe('1.500')
  })
})

describe('formatPropertyCode', () => {
  // As seis formas que convivem na MESMA imobiliária hoje.
  test('as variações da mesma imobiliária viram um padrão só', () => {
    expect(formatPropertyCode('A.D-0016')).toBe('AD-0016')
    expect(formatPropertyCode('V.D0013')).toBe('VD-0013')
    expect(formatPropertyCode('V.D 005')).toBe('VD-005')
    expect(formatPropertyCode('V.D- 0010')).toBe('VD-0010')
    expect(formatPropertyCode('A.V 0011')).toBe('AV-0011')
    expect(formatPropertyCode('VD-009')).toBe('VD-009')
  })

  // Zerar à esquerda para um tamanho fixo inventaria numeração que a
  // imobiliária não escreveu.
  test('não mexe na quantidade de dígitos', () => {
    expect(formatPropertyCode('LC-003')).toBe('LC-003')
    expect(formatPropertyCode('NC-0258')).toBe('NC-0258')
  })

  test('código fora do padrão letras+dígitos passa intacto', () => {
    expect(formatPropertyCode('CASA 2A')).toBe('CASA 2A')
    expect(formatPropertyCode('12345')).toBe('12345')
  })

  test('tolera vazio e espaço nas pontas', () => {
    expect(formatPropertyCode('')).toBe('')
    expect(formatPropertyCode('  vd-007 ')).toBe('VD-007')
  })
})
