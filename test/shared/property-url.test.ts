import { describe, expect, test } from 'vitest'
import { slugify, propertySlug, propertyPath } from '~~/shared/utils/property-url'

describe('slugify', () => {
  test('remove acento e baixa a caixa', () => {
    expect(slugify('Três Lagoas')).toBe('tres-lagoas')
    expect(slugify('Jardim Alvorada')).toBe('jardim-alvorada')
  })

  // Os dados reais têm "Vila piloto " com espaço no fim e "V.L DE Leon".
  test('colapsa separadores e não deixa hífen nas pontas', () => {
    expect(slugify('  Vila piloto  ')).toBe('vila-piloto')
    expect(slugify('V.L DE Leon')).toBe('v-l-de-leon')
    expect(slugify('---')).toBe('')
  })
})

describe('propertySlug', () => {
  test('casa usa tipo, quartos e bairro', () => {
    const s = propertySlug({ type: 'casa', bedrooms: 3, neighborhood: 'Centro', code: 'NC-0231' })
    expect(s).toBe('casa-3-quartos-centro')
  })

  // Terreno não tem quartos: sem esta regra sairia "terreno-0-quartos".
  test('terreno omite os quartos', () => {
    const s = propertySlug({ type: 'terreno', bedrooms: 0, neighborhood: 'Village do Lago', code: 'NC-0258' })
    expect(s).toBe('terreno-village-do-lago')
  })

  test('imóvel sem bairro omite o trecho, sem deixar hífen sobrando', () => {
    const s = propertySlug({ type: 'casa', bedrooms: 3, neighborhood: null, code: 'NC-0301' })
    expect(s).toBe('casa-3-quartos')
  })

  test('quartos zero em imóvel construído também é omitido', () => {
    const s = propertySlug({ type: 'apartamento', bedrooms: 0, neighborhood: 'Centro', code: 'X1' })
    expect(s).toBe('apartamento-centro')
  })
})

describe('propertyPath', () => {
  test('monta /{slug}/{codigo}', () => {
    const path = propertyPath({ type: 'casa', bedrooms: 3, neighborhood: 'Centro', code: 'NC-0231' })
    expect(path).toBe('/casa-3-quartos-centro/NC-0231')
  })

  // O código é a CHAVE e vai cru, preservando caixa e pontuação: é o que a
  // consulta usa. Só o que não é seguro em URL é escapado.
  test('preserva o código como está, escapando o que a URL exige', () => {
    expect(propertyPath({ type: 'casa', bedrooms: 2, neighborhood: null, code: 'V.D 005' })).toBe(
      '/casa-2-quartos/V.D%20005',
    )
    expect(propertyPath({ type: 'terreno', bedrooms: 0, neighborhood: null, code: 'V.D0013' })).toBe(
      '/terreno/V.D0013',
    )
  })
})
