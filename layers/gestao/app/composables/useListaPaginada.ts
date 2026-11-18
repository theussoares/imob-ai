import { filtroDaUrl, queryDaLista, type FiltroLista, type Pagina } from '../../domain/paginacao'

/**
 * Lista de contratos paginada, com página, busca e status NA URL (`?pagina=2&q=silva&status=...`):
 * recarregar, voltar e colar o link mantêm a lista como estava. A URL é a única fonte do filtro;
 * o campo de busca tem cópia local só para não navegar a cada tecla.
 *
 * Mudar busca ou status volta à página 1 e troca a entrada do histórico (`replace`): digitar não
 * enche o botão «voltar». Mudar de página empilha (`push`), e «voltar» volta à página anterior.
 */
export function useListaPaginada<T>(buscar: (f: FiltroLista) => Promise<Pagina<T>>, statusValidos: readonly string[]) {
  const store = useGestaoStore()
  const route = useRoute()

  const filtro = computed(() => filtroDaUrl(route.query, statusValidos))
  const resultado = ref<Pagina<T> | null>(null) as Ref<Pagina<T> | null>
  const carregando = ref(true)
  const falhou = ref(false)
  const q = ref(filtro.value.q)

  function ir(parcial: Partial<FiltroLista>, opcoes: { substituir?: boolean } = {}) {
    return navigateTo({ query: queryDaLista({ ...filtro.value, ...parcial }) }, { replace: !!opcoes.substituir })
  }

  // Resposta velha não pode sobrescrever a nova: digitar rápido dispara várias buscas, e a rede não
  // garante a ordem de volta.
  let seq = 0
  async function carregar() {
    const minha = ++seq
    carregando.value = true
    falhou.value = false
    try {
      await store.carregar()
      const r = await buscar(filtro.value)
      if (minha !== seq) return
      // Página além da última (lista encolheu, ou link antigo): vai para a última em vez de mostrar «nada».
      if (r.itens.length === 0 && r.total > 0 && filtro.value.pagina > r.paginas) {
        await ir({ pagina: r.paginas }, { substituir: true })
        return
      }
      resultado.value = r
    } catch {
      if (minha !== seq) return
      falhou.value = true
    } finally {
      if (minha === seq) carregando.value = false
    }
  }

  watch(filtro, carregar, { immediate: true })

  // «Voltar» do navegador troca a URL por fora: o campo acompanha.
  watch(() => filtro.value.q, (novo) => {
    if (novo !== q.value.trim()) q.value = novo
  })

  let timer: ReturnType<typeof setTimeout> | undefined
  watch(q, (novo) => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      if (novo.trim() !== filtro.value.q) void ir({ q: novo, pagina: 1 }, { substituir: true })
    }, 300)
  })
  onBeforeUnmount(() => clearTimeout(timer))

  return {
    filtro,
    resultado,
    carregando,
    falhou,
    q,
    carregar,
    irParaPagina: (pagina: number) => ir({ pagina }),
    mudarStatus: (status: string) => ir({ status, pagina: 1 }, { substituir: true }),
    limpar: () => {
      q.value = ''
      return navigateTo({ query: {} }, { replace: true })
    },
  }
}
