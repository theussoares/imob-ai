import type { Ref } from 'vue'
import type { PropertyCard, PropertyType, PropertyPurpose } from '~~/shared/models/property'

export type SortKey = 'rel' | 'menor' | 'maior' | 'area'

export interface CatalogFilters {
  purpose: PropertyPurpose
  q: string
  type: '' | PropertyType
  bedrooms: number
  maxPrice: number
  sort: SortKey
}

export function createCatalogFilters(): CatalogFilters {
  return { purpose: 'venda', q: '', type: '', bedrooms: 0, maxPrice: 0, sort: 'rel' }
}

/**
 * Filtro/ordenação 100% em memória sobre a lista já carregada — nenhuma
 * requisição extra é feita ao interagir com os filtros.
 */
export function useCatalog(properties: Ref<PropertyCard[]>, filters: CatalogFilters) {
  const filtered = computed(() => {
    let list = properties.value.filter((p) => p.purpose === filters.purpose)

    const term = filters.q.trim().toLowerCase()
    if (term) {
      list = list.filter((p) =>
        `${p.neighborhood ?? ''} ${p.city ?? ''} ${p.title} ${p.code}`.toLowerCase().includes(term),
      )
    }
    if (filters.type) list = list.filter((p) => p.type === filters.type)
    if (filters.bedrooms) list = list.filter((p) => p.bedrooms >= filters.bedrooms)
    if (filters.maxPrice) list = list.filter((p) => p.price <= filters.maxPrice)

    const arr = [...list]
    if (filters.sort === 'menor') arr.sort((a, b) => a.price - b.price)
    else if (filters.sort === 'maior') arr.sort((a, b) => b.price - a.price)
    else if (filters.sort === 'area') arr.sort((a, b) => b.area - a.area)
    else arr.sort((a, b) => Number(b.featured) - Number(a.featured))
    return arr
  })

  function reset() {
    filters.q = ''
    filters.type = ''
    filters.bedrooms = 0
    filters.maxPrice = 0
    filters.sort = 'rel'
  }

  return { filtered, reset }
}
