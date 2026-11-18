import type { Pagina } from '../../domain/paginacao'

/**
 * Lista paginada com o filtro INTEIRO na URL (página, busca e o que mais a tela tiver — status, aba,
 * categoria): recarregar, voltar e colar o link mantêm a lista como estava. A URL é a única fonte do
 * filtro; o campo de busca tem cópia local só para não navegar a cada tecla.
 *
 * `ler` e `escrever` são o par URL ⇄ filtro da tela (funções puras de `domain/`, testadas em Node).
 *
 * Mudar busca ou um filtro volta à página 1 e troca a entrada do histórico (`replace`): digitar não enche
 * o botão «voltar». Mudar de página empilha (`push`), e «voltar» volta à página anterior.
 */
export function useListaPaginada<R extends Pagina<unknown>, F extends { pagina: number; q: string }>(
  buscar: (f: F) => Promise<R>,
  ler: (query: Record<string, unknown>) => F,
  escrever: (f: F) => Record<string, string>,
) {
  const store = useGestaoStore()
  const route = useRoute()

  const filtro = computed(() => ler(route.query))
  const resultado = ref<R | null>(null) as Ref<R | null>
  const falhou = ref(false)
  const q = ref(filtro.value.q)

  function ir(parcial: Partial<F>, opcoes: { substituir?: boolean } = {}) {
    return navigateTo({ query: escrever({ ...filtro.value, ...parcial }) }, { replace: !!opcoes.substituir })
  }

  // Resposta velha não pode sobrescrever a nova: digitar rápido dispara várias buscas, e a rede não
  // garante a ordem de volta.
  let seq = 0
  async function carregar() {
    const minha = ++seq
    falhou.value = false
    try {
      await store.carregar(false, ['base', 'corretores', 'config'])
      const r = await buscar(filtro.value)
      if (minha !== seq) return
      // Página além da última (lista encolheu, ou link antigo): vai para a última em vez de mostrar «nada».
      if (r.itens.length === 0 && r.total > 0 && filtro.value.pagina > r.paginas) {
        await ir({ pagina: r.paginas } as Partial<F>, { substituir: true })
        return
      }
      resultado.value = r
    } catch {
      if (minha !== seq) return
      falhou.value = true
    }
  }

  // Compara o filtro pelo conteúdo: `route.query` é novo a cada navegação, mesmo com o mesmo valor.
  watch(() => JSON.stringify(filtro.value), carregar, { immediate: true })

  // «Voltar» do navegador troca a URL por fora: o campo acompanha.
  watch(() => filtro.value.q, (novo) => {
    if (novo !== q.value.trim()) q.value = novo
  })

  let timer: ReturnType<typeof setTimeout> | undefined
  watch(q, (novo) => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      if (novo.trim() !== filtro.value.q) void ir({ q: novo, pagina: 1 } as Partial<F>, { substituir: true })
    }, 300)
  })
  onBeforeUnmount(() => clearTimeout(timer))

  return {
    filtro,
    resultado,
    falhou,
    q,
    carregar,
    irParaPagina: (pagina: number) => ir({ pagina } as Partial<F>),
    /** Muda um filtro que não é página nem busca; volta à página 1. */
    mudar: (parcial: Partial<F>) => ir({ ...parcial, pagina: 1 }, { substituir: true }),
    limpar: () => {
      q.value = ''
      return navigateTo({ query: {} }, { replace: true })
    },
  }
}
