import { describe, expect, test } from 'vitest'
import { qualifyingCategories, categorySlug } from '~~/shared/utils/category'

/**
 * O sitemap não pode publicar URL que responde noindex: seria pedir indexação
 * de uma página que se recusa a ser indexada. O piso decide os dois.
 */
describe('categorias no sitemap', () => {
  const venda = { type: 'casa' as const, purpose: 'venda' as const }

  test('pretensão com estoque suficiente entra', () => {
    const slugs = qualifyingCategories([venda, venda, venda]).map(categorySlug)
    expect(slugs).toContain('a-venda')
    expect(slugs).toContain('casas-a-venda')
  })

  test('pretensão sem estoque fica fora', () => {
    const slugs = qualifyingCategories([venda, venda, venda]).map(categorySlug)
    expect(slugs).not.toContain('para-alugar')
  })

  // O caso da tatiane e da olmi: a página existe e está linkada na home, mas
  // responde noindex — logo, não pode estar aqui.
  test('um único aluguel não coloca a página no sitemap', () => {
    const itens = [venda, venda, venda, { type: 'casa' as const, purpose: 'aluguel' as const }]
    const slugs = qualifyingCategories(itens).map(categorySlug)
    expect(slugs).not.toContain('para-alugar')
  })
})
