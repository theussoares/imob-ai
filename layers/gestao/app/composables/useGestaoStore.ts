import { agora, type Estado, type Resultado } from '../../domain/acoes'
import * as acoes from '../../domain/acoes'
import { capacidades, locacoesVisiveis as filtrarLocacoesVisiveis, matrizPadrao, processosVisiveis } from '../../domain/permissions'
import { locacoesSeed } from '../../domain/locacao-seed'
import { documentosSeedCompleto, processosSeed } from '../../domain/seed'
import type { Documento, Locacao, MatrizPermissoes, Processo } from '../../domain/types'

// v3: entrou `locacoes`; o v2 guardado deixaria a lista de locação vazia.
const CHAVE = 'gestao-demo-v3'

interface Guardado extends Estado {
  matriz: MatrizPermissoes
}

/**
 * Dados do painel. Parte dos GETs do mock (`/api/gestao/*`) e guarda as
 * mutações aqui mesmo, no cliente, persistidas em localStorage — o
 * `mocker-nuxt` não tem estado (spec, tabela de decisões).
 *
 * Se o mock não responde (servidor subido sem `NUXT_MOCKER_SERVER_ENABLED`), cai
 * nos mesmos dados direto do domínio. Motivo: o painel não pode amanhecer em
 * branco numa reunião por causa de uma variável de ambiente. O custo é que a
 * falta do mock fica silenciosa — por isso o aviso no console.
 */
export function useGestaoStore() {
  const estado = useState<Estado>('gestao:estado', () => ({ processos: [], documentos: [], locacoes: [] }))
  const matriz = useState<MatrizPermissoes>('gestao:matriz', () => matrizPadrao())
  const carregado = useState<boolean>('gestao:carregado', () => false)
  const { sessao } = useGestaoSessao()

  function persistir() {
    if (!import.meta.client) return
    try {
      localStorage.setItem(CHAVE, JSON.stringify({ ...estado.value, matriz: matriz.value } satisfies Guardado))
    } catch {
      /* sem persistência: o demo segue em memória */
    }
  }

  async function carregar(forcar = false) {
    if (carregado.value && !forcar) return
    if (import.meta.client && !forcar) {
      try {
        const bruto = localStorage.getItem(CHAVE)
        if (bruto) {
          const g = JSON.parse(bruto) as Guardado
          if (Array.isArray(g.processos) && Array.isArray(g.documentos) && Array.isArray(g.locacoes)) {
            estado.value = { processos: g.processos, documentos: g.documentos, locacoes: g.locacoes }
            matriz.value = g.matriz ?? matrizPadrao()
            carregado.value = true
            return
          }
        }
      } catch {
        /* guardado corrompido: recarrega do seed */
      }
    }
    try {
      const [p, d, l, m] = await Promise.all([
        $fetch<{ data: Processo[] }>('/api/gestao/processos'),
        $fetch<{ data: Documento[] }>('/api/gestao/documentos'),
        $fetch<{ data: Locacao[] }>('/api/gestao/locacoes'),
        $fetch<{ data: MatrizPermissoes }>('/api/gestao/permissoes'),
      ])
      estado.value = { processos: p.data, documentos: d.data, locacoes: l.data }
      matriz.value = m.data
    } catch {
      console.warn('[gestao] mock indisponível (suba com `pnpm dev:gestao`); usando o seed local.')
      estado.value = { processos: processosSeed(), documentos: documentosSeedCompleto(), locacoes: locacoesSeed() }
      matriz.value = matrizPadrao()
    }
    carregado.value = true
    persistir()
  }

  /** Volta ao seed e apaga o que foi feito no demo. */
  async function restaurar() {
    if (import.meta.client) {
      try {
        localStorage.removeItem(CHAVE)
      } catch {
        /* idem */
      }
    }
    await carregar(true)
  }

  /** Aplica uma transição pura do domínio; só grava se deu certo. */
  function aplicar(fn: (e: Estado, ator: { nome: string }) => Resultado): Resultado {
    const nome = sessao.value?.nome ?? 'Sistema'
    const r = fn(estado.value, { nome })
    if (r.ok) {
      estado.value = r.estado
      persistir()
    }
    return r
  }

  const caps = (p: Processo | null = null) =>
    sessao.value ? capacidades(matriz.value, sessao.value, p) : null

  const visiveis = computed(() =>
    sessao.value ? processosVisiveis(matriz.value, sessao.value, estado.value.processos) : [],
  )

  const locacoesVisiveis = computed(() =>
    sessao.value ? filtrarLocacoesVisiveis(matriz.value, sessao.value, estado.value.locacoes) : [],
  )

  return {
    locacoes: computed(() => estado.value.locacoes),
    locacoesVisiveis,
    processos: computed(() => estado.value.processos),
    documentos: computed(() => estado.value.documentos),
    matriz,
    visiveis,
    carregado,
    carregar,
    restaurar,
    aplicar,
    caps,
    acoes,
    agora,
  }
}
