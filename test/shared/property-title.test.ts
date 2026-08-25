import { describe, expect, test } from 'vitest'
import { propertyTitle } from '~~/shared/utils/property-title'

const base = {
  type: 'casa' as const,
  purpose: 'venda' as const,
  bedrooms: 3,
  area: 180,
  neighborhood: 'Centro',
  city: 'Três Lagoas',
}

describe('propertyTitle', () => {
  test('compõe tipo, quartos, pretensão, bairro e cidade', () => {
    expect(propertyTitle(base)).toBe('Casa 3 quartos à venda no Centro, Três Lagoas')
  })

  test('aluguel troca a pretensão', () => {
    expect(propertyTitle({ ...base, purpose: 'aluguel' })).toBe(
      'Casa 3 quartos para alugar no Centro, Três Lagoas',
    )
  })

  // Hoje sairia "1 quartos".
  test('um quarto é singular', () => {
    expect(propertyTitle({ ...base, bedrooms: 1 })).toBe(
      'Casa 1 quarto à venda no Centro, Três Lagoas',
    )
  })

  // Terreno não tem quartos. Sem a área, dois terrenos do mesmo bairro
  // produziriam títulos idênticos — foi o que a simulação com dado real mostrou.
  test('terreno usa área no lugar dos quartos', () => {
    expect(propertyTitle({ ...base, type: 'terreno', bedrooms: 0, area: 300 })).toBe(
      'Terreno 300m² à venda no Centro, Três Lagoas',
    )
  })

  test('terreno sem área cadastrada omite a medida', () => {
    expect(propertyTitle({ ...base, type: 'terreno', bedrooms: 0, area: 0 })).toBe(
      'Terreno à venda no Centro, Três Lagoas',
    )
  })

  test('área fracionada é arredondada', () => {
    expect(propertyTitle({ ...base, type: 'terreno', bedrooms: 0, area: 299.6 })).toBe(
      'Terreno 300m² à venda no Centro, Três Lagoas',
    )
  })

  // Dado real: "Vila piloto " chega com espaço no fim.
  test('limpa espaço sobrando do bairro', () => {
    expect(propertyTitle({ ...base, neighborhood: 'Vila piloto ' })).toBe(
      'Casa 3 quartos à venda no Vila piloto, Três Lagoas',
    )
  })

  test('sem bairro e sem cidade, os trechos somem inteiros', () => {
    expect(propertyTitle({ ...base, neighborhood: null, city: null })).toBe(
      'Casa 3 quartos à venda',
    )
  })

  // Caso típico: a fórmula mantém o título dentro do corte do Google (60 chars).
  // Medido em 48 imóveis reais: a média é muito menor. Este teste afirma que o
  // caso comum não infla.
  test('caso típico cabe no corte do Google', () => {
    expect(propertyTitle(base).length).toBeLessThanOrEqual(60)
  })

  // Pior caso realista: a fórmula não infla além do que foi medido em 48 imóveis
  // reais (máximo observado: 64 caracteres). Este teste avisa se uma mudança
  // futura na fórmula ultrapassar o teto medido. NÃO afirma que todo título cabe
  // no corte do Google — afirma que não piorou.
  test('pior caso medido não infla além do limite', () => {
    const longo = propertyTitle({
      ...base,
      type: 'apartamento',
      bedrooms: 4,
      neighborhood: 'Jardim Alvorada',
    })
    expect(longo.length).toBeLessThanOrEqual(65)
  })
})
