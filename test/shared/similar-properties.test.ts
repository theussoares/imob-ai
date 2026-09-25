import { describe, expect, test } from 'vitest'
import type { PropertyCard } from '~~/shared/models/property'
import { similarProperties, similaresPorCodigo } from '~~/shared/utils/similar-properties'
import { neighborhoodMapsEmbedSrc, neighborhoodMapsLink } from '~~/shared/utils/address'

/**
 * "Semelhantes" é a saída de quem não gostou do imóvel.
 *
 * ⚠️ O que estes testes guardam é a recomendação que trai: um aluguel sugerido
 * a quem quer comprar, o próprio imóvel repetido na lista, ou enchimento sem
 * relação nenhuma — tudo passa sem erro e ensina a pessoa a ignorar a seção.
 */

function card(p: Partial<PropertyCard> & { code: string }): PropertyCard {
  return {
    id: p.code, title: p.code, type: 'casa', purpose: 'venda', price: 300000,
    neighborhood: 'Centro', city: 'Três Lagoas', bedrooms: 3, suites: 0, bathrooms: 2,
    parking: 1, area: 100, highStandard: false, featured: false, images: [], ...p,
  }
}

const alvo = card({ code: 'A' })

describe('similarProperties', () => {
  test('nunca sugere o próprio imóvel', () => {
    expect(similarProperties(alvo, [alvo, card({ code: 'B' })]).map((c) => c.code)).toEqual(['B'])
  })

  test('aluguel não substitui compra, por mais parecido que seja', () => {
    expect(similarProperties(alvo, [card({ code: 'B', purpose: 'aluguel' })])).toEqual([])
  })

  test('mesmo bairro e tipo vêm antes de só mesma faixa de preço', () => {
    const r = similarProperties(alvo, [
      card({ code: 'preco', type: 'apartamento', neighborhood: 'Outro' }),
      card({ code: 'bairro-tipo', price: 900000 }),
    ])
    expect(r.map((c) => c.code)).toEqual(['bairro-tipo', 'preco'])
  })

  test('sem nada em comum não entra como enchimento', () => {
    const r = similarProperties(alvo, [
      card({ code: 'nada', type: 'terreno', neighborhood: 'Outro', price: 50000 }),
    ])
    expect(r).toEqual([])
  })

  test('empate decide pelo preço mais próximo', () => {
    const r = similarProperties(alvo, [
      card({ code: 'longe', price: 380000 }),
      card({ code: 'perto', price: 310000 }),
    ])
    expect(r.map((c) => c.code)).toEqual(['perto', 'longe'])
  })

  test('respeita o limite', () => {
    const muitos = Array.from({ length: 10 }, (_, i) => card({ code: `C${i}` }))
    expect(similarProperties(alvo, muitos)).toHaveLength(4)
  })
})

describe('neighborhoodMapsEmbedSrc', () => {
  test('busca o bairro com cidade e UF, nunca um endereço', () => {
    const src = neighborhoodMapsEmbedSrc({ neighborhood: 'Jardim das Américas', city: 'Três Lagoas', state: 'MS' })
    expect(decodeURIComponent(src!)).toContain('q=Jardim das Américas, Três Lagoas - MS')
  })

  test('sem bairro não há mapa — a cidade inteira não ajuda a decidir', () => {
    expect(neighborhoodMapsEmbedSrc({ neighborhood: null, city: 'Três Lagoas' })).toBeNull()
    expect(neighborhoodMapsEmbedSrc({ neighborhood: '  ', city: 'Três Lagoas' })).toBeNull()
  })

  test('o link externo busca o mesmo bairro do iframe', () => {
    const p = { neighborhood: 'Centro', city: 'Três Lagoas', state: 'MS' }
    expect(decodeURIComponent(neighborhoodMapsLink(p)!)).toContain('query=Centro, Três Lagoas - MS')
    expect(neighborhoodMapsLink({ neighborhood: null, city: 'Três Lagoas' })).toBeNull()
  })
})

describe('similaresPorCodigo', () => {
  const catalogo = [card({ code: 'NC-0258' }), card({ code: 'NC-0300' }), card({ code: 'NC-0400', purpose: 'aluguel' })]

  test('acha o imóvel pelo código sem diferenciar caixa, como a página de detalhe', () => {
    expect(similaresPorCodigo('nc-0258', catalogo).map((c) => c.code)).toEqual(['NC-0300'])
  })

  test('imóvel fora do catálogo publicado não quebra: lista vazia', () => {
    expect(similaresPorCodigo('RASCUNHO-1', catalogo)).toEqual([])
  })
})
