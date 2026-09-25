import { describe, expect, test } from 'vitest'
import {
  catalogFiltersFromQuery,
  catalogFiltersToQuery,
  type CatalogQueryFilters,
} from '~~/shared/utils/catalog-query'

/**
 * A busca da home vai para a URL para poder ser mandada no WhatsApp.
 *
 * ⚠️ O risco que estes testes guardam é o link que chega errado sem avisar:
 * um parâmetro adulterado que zera a lista ("nenhum imóvel"), ou uma ida e
 * volta que perde um filtro — quem recebeu vê outra busca e não tem como saber.
 */

const padrao: CatalogQueryFilters = {
  purpose: 'venda', q: '', type: '', bedrooms: 0, maxPrice: 0, sort: 'rel',
}

describe('catalogFiltersToQuery', () => {
  test('busca sem filtro não suja a URL', () => {
    expect(catalogFiltersToQuery(padrao)).toEqual({})
  })

  test('só o que difere do padrão entra', () => {
    expect(catalogFiltersToQuery({ ...padrao, type: 'casa', maxPrice: 350000 }))
      .toEqual({ tipo: 'casa', ate: '350000' })
  })
})

describe('catalogFiltersFromQuery', () => {
  test('ida e volta preserva todos os filtros', () => {
    const f: CatalogQueryFilters = {
      purpose: 'aluguel', q: 'Centro', type: 'apartamento', bedrooms: 2, maxPrice: 2500, sort: 'menor',
    }
    expect({ ...padrao, ...catalogFiltersFromQuery(catalogFiltersToQuery(f)) }).toEqual(f)
  })

  test('valor adulterado é ignorado em vez de virar filtro que esvazia a lista', () => {
    expect(catalogFiltersFromQuery({
      finalidade: 'permuta', tipo: 'casaa', quartos: 'abc', ate: '-5', ordem: 'aleatoria',
    })).toEqual({})
  })

  test('quartos fora do seletor (1 a 4+) não entra', () => {
    expect(catalogFiltersFromQuery({ quartos: '9' })).toEqual({})
    expect(catalogFiltersFromQuery({ quartos: '0' })).toEqual({})
  })

  test('parâmetro repetido usa o primeiro, sem quebrar', () => {
    expect(catalogFiltersFromQuery({ tipo: ['terreno', 'casa'] })).toEqual({ type: 'terreno' })
  })

  test('termo gigante é cortado — é texto de link colado, não de busca', () => {
    expect(catalogFiltersFromQuery({ q: 'x'.repeat(500) }).q).toHaveLength(80)
  })
})
