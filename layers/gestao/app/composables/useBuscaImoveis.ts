import type { ImovelGestao } from '../../domain/imoveis'
import { FILTRO_LISTA_IMOVEIS_VAZIO, type ImovelDaLista } from '../../domain/imoveis-lista'
import type { PropertyPurpose } from '~~/shared/models/property'

/**
 * Opções do seletor de imóvel dos contratos (novo processo, nova locação, abertura da locação).
 *
 * Não lê mais a lista inteira do store (só os 200 mais recentes): pergunta ao servidor, pela mesma consulta da
 * lista de imóveis, os da `finalidade` que casam com o texto, uma página (`POR_PAGINA`). Quem tem mais que isso
 * refina a busca; `restantes` diz quantos ficaram de fora, e a tela avisa.
 *
 * O imóvel ESCOLHIDO (e o já vinculado ao contrato que se edita) fica sempre na lista, mesmo fora do resultado
 * da busca: senão trocar o texto faria o `<select>` perder a opção marcada, e o rótulo gravado no contrato
 * (`achar`) viria vazio.
 */
export function useBuscaImoveis(finalidade: PropertyPurpose, escolhido: Ref<string>) {
  const store = useGestaoStore()
  const q = ref('')
  const achados = ref<ImovelDaLista[]>([])
  const total = ref(0)
  const falhou = ref(false)
  const lembrado = ref<ImovelGestao | null>(null)

  // Resposta velha não sobrescreve a nova: digitar rápido dispara várias buscas.
  let seq = 0
  async function buscar() {
    const minha = ++seq
    try {
      const r = await store.paginaDeImoveis({ ...FILTRO_LISTA_IMOVEIS_VAZIO, q: q.value, purpose: finalidade })
      if (minha !== seq) return
      achados.value = r.itens
      total.value = r.total
      falhou.value = false
    } catch {
      if (minha === seq) falhou.value = true
    }
  }

  const opcoes = computed<ImovelGestao[]>(() => {
    const extra = lembrado.value && !achados.value.some((i) => i.id === lembrado.value!.id) ? [lembrado.value] : []
    return [...extra, ...achados.value]
  })
  const achar = (id: string): ImovelGestao | null => opcoes.value.find((i) => i.id === id) ?? null

  // O vínculo pode ser de um imóvel fora da primeira página (ou fora dos 200 do store): vai buscá-lo pelo id.
  watch(escolhido, async (id) => {
    if (!id) return (lembrado.value = null)
    lembrado.value = achar(id) ?? (await store.obterImovel(id))
  }, { immediate: true })

  let timer: ReturnType<typeof setTimeout> | undefined
  watch(q, () => {
    clearTimeout(timer)
    timer = setTimeout(() => void buscar(), 300)
  })
  onMounted(() => void buscar())
  onBeforeUnmount(() => clearTimeout(timer))

  return reactive({ q, opcoes, achar, falhou, restantes: computed(() => Math.max(0, total.value - achados.value.length)), buscar })
}
