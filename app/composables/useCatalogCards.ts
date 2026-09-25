import type { PropertyCard } from '~~/shared/models/property'
import { enxugarCards } from '~~/shared/utils/card-photos'

/**
 * Os cards do catálogo, com a MESMA chave e o MESMO formato em toda página.
 *
 * Home, categoria, bairro e "quero vender" compartilham a chave `properties`:
 * navegar entre elas não refaz a requisição, e o payload SSR não é duplicado.
 * Por isso a busca vive num lugar só — se uma delas enxugasse as fotos e outra
 * não, o formato no cache dependeria de qual página abriu primeiro.
 *
 * `vazio`: a raiz da plataforma (landing da Moradi) não tem catálogo.
 */
export function useCatalogCards(opts?: { vazio?: boolean }) {
  const requestFetch = useRequestFetch()
  return useAsyncData(
    'properties',
    () =>
      opts?.vazio
        ? Promise.resolve([] as PropertyCard[])
        : requestFetch<PropertyCard[]>('/api/properties').then(enxugarCards),
    {
      default: () => [] as PropertyCard[],
      getCachedData: (key, nuxtApp) => nuxtApp.payload.data[key] ?? nuxtApp.static.data[key],
    },
  )
}
