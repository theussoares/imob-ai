import { describe, expect, test } from 'vitest'
import {
  categorySlug,
  categoryLabel,
  parseCategorySlug,
  allCategories,
  qualifyingCategories,
} from '~~/shared/utils/category'

describe('categoria só de pretensão', () => {
  test('slug é a pretensão sozinha', () => {
    expect(categorySlug({ type: null, purpose: 'venda' })).toBe('a-venda')
    expect(categorySlug({ type: null, purpose: 'aluguel' })).toBe('para-alugar')
  })

  test('rótulo genérico', () => {
    expect(categoryLabel({ type: null, purpose: 'venda' })).toBe('Imóveis à venda')
    expect(categoryLabel({ type: null, purpose: 'aluguel' })).toBe('Imóveis para alugar')
  })

  test('ida e volta pelo slug', () => {
    expect(parseCategorySlug('a-venda')).toEqual({ type: null, purpose: 'venda' })
    expect(parseCategorySlug('para-alugar')).toEqual({ type: null, purpose: 'aluguel' })
  })

  // O risco óbvio: "a-venda" ser confundido com o sufixo de "casas-a-venda".
  test('não colide com a categoria de tipo', () => {
    expect(parseCategorySlug('casas-a-venda')).toEqual({ type: 'casa', purpose: 'venda' })
    expect(categorySlug({ type: 'casa', purpose: 'venda' })).toBe('casas-a-venda')
  })

  test('slug inválido continua devolvendo null', () => {
    expect(parseCategorySlug('qualquer-coisa')).toBeNull()
    expect(parseCategorySlug('')).toBeNull()
  })

  test('allCategories inclui as duas de pretensão além das oito de tipo', () => {
    const todas = allCategories()
    expect(todas).toHaveLength(10)
    expect(todas.filter((c) => c.type === null)).toHaveLength(2)
  })
})

describe('qualifyingCategories com pretensão', () => {
  const casa = { type: 'casa' as const, purpose: 'venda' as const }

  test('a de pretensão conta todos os tipos daquela pretensão', () => {
    // 3 imóveis à venda, de tipos diferentes: nenhuma categoria de tipo
    // qualifica, mas "a-venda" sim.
    const itens = [
      { type: 'casa' as const, purpose: 'venda' as const },
      { type: 'apartamento' as const, purpose: 'venda' as const },
      { type: 'terreno' as const, purpose: 'venda' as const },
    ]
    const slugs = qualifyingCategories(itens).map(categorySlug)
    expect(slugs).toContain('a-venda')
    expect(slugs).not.toContain('casas-a-venda')
  })

  test('abaixo do piso não qualifica', () => {
    const slugs = qualifyingCategories([casa, casa]).map(categorySlug)
    expect(slugs).not.toContain('a-venda')
  })
})
