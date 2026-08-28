import { describe, expect, test } from 'vitest'
import { toPropertyCardModel, type PublicPropertyCardRow, type PropertyImageFields } from '~~/server/mappers/property.mapper'

function cardRow(over: Partial<PublicPropertyCardRow> = {}): PublicPropertyCardRow {
  return {
    id: 'p1',
    code: 'NC-0231',
    title: 'Casa no Centro',
    type: 'casa',
    purpose: 'venda',
    price: 350000,
    neighborhood: 'Centro',
    city: 'Três Lagoas',
    bedrooms: 3,
    suites: 1,
    bathrooms: 2,
    parking: 2,
    area: 180,
    high_standard: false,
    featured: false,
    ...over,
  }
}

function img(over: Partial<PropertyImageFields> = {}): PropertyImageFields {
  return {
    id: 'img-1',
    url: 'https://x/full.webp',
    url_sm: 'https://x/sm.webp',
    alt: null,
    position: 0,
    is_cover: false,
    ...over,
  }
}

describe('toPropertyCardModel', () => {
  // O carrossel do card precisa de mais de uma foto — antes o mapper só
  // extraía a capa e descartava o resto do embed.
  test('devolve todas as fotos recebidas em `images`, não só a capa', () => {
    const images = [img({ id: 'a', position: 0 }), img({ id: 'b', position: 1 })]

    const card = toPropertyCardModel(cardRow(), images)

    expect(card.images.map((i) => i.id)).toEqual(['a', 'b'])
  })

  test('em `images`, a capa vem primeiro mesmo quando não é a de menor posição', () => {
    const images = [img({ id: 'a', position: 0, is_cover: false }), img({ id: 'b', position: 1, is_cover: true })]

    const card = toPropertyCardModel(cardRow(), images)

    expect(card.images[0]?.id).toBe('b')
  })

  test('sem fotos, `images` fica vazio', () => {
    const card = toPropertyCardModel(cardRow(), [])

    expect(card.images).toEqual([])
  })
})
