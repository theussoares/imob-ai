import { filtroImoveisDaUrl, queryDaListaImoveis } from '../../domain/imoveis-lista'

/**
 * Tela «Imóveis»: página, busca e filtros vivem na URL (`useListaPaginada`) e a lista é fatiada pelo servidor.
 * A tela não carrega mais a lista inteira de imóveis nem os contratos: cada item já traz a situação.
 */
export function useImoveisScreen() {
  const store = useGestaoStore()
  const lista = useListaPaginada((f) => store.paginaDeImoveis(f), filtroImoveisDaUrl, queryDaListaImoveis)

  const nomeCorretor = (id: string) => store.corretores.value.find((c) => c.id === id)?.nome ?? ''
  return reactive({
    ...lista,
    itens: computed(() => lista.resultado.value?.itens ?? []),
    podeCriar: computed(() => store.permissoesDoImovel().criar),
    nomeCorretor,
    temFiltro: computed(() => !!(lista.filtro.value.q || lista.filtro.value.status || lista.filtro.value.purpose || lista.filtro.value.situacao)),
  })
}
