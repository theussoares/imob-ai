import { agora, type Estado, type Resultado } from '../../domain/acoes'
import * as acoes from '../../domain/acoes'
import { proximoIdConsulta, realizarConsulta, type ConsultaFeita, type EntradaConsulta, type ResultadoConsulta } from '../../domain/consulta'
import { configuracoesPadrao, type ConfiguracoesGestao } from '../../domain/configuracoes'
import { capacidades, locacoesVisiveis as filtrarLocacoesVisiveis, matrizPadrao, processosVisiveis } from '../../domain/permissions'
import { imoveisSeed, type ImovelGestao } from '../../domain/imoveis'
import { imoveisVisiveis as filtrarImoveisVisiveis, permissoesImovel, podeExcluirImovel, type NovoImovel, type PermissoesImovel, type ResultadoImovel } from '../../domain/imoveis-acoes'
import type { FotoNova } from '../../domain/imoveis-fotos'
import type { PropertyStatus } from '../../../../shared/models/property'
import { MockImoveisRepository } from '../services/MockImoveisRepository'
import { locacoesSeed } from '../../domain/locacao-seed'
import { documentosSeedCompleto, processosSeed } from '../../domain/seed'
import type { Documento, Locacao, MatrizPermissoes, Processo } from '../../domain/types'

// v5: o imóvel ganhou os campos do catálogo (preço, bairro, fotos, corretor vendedor…); o v4 guardado
// traria o cadastro de 6 campos. (v4: o seed da locação passou a ser ancorado em «hoje».)
const CHAVE = 'gestao-demo-v5'

interface Guardado extends Estado {
  matriz: MatrizPermissoes
  /** ausente em estado guardado antes das Configurações: cai no padrão */
  config?: ConfiguracoesGestao
  /** ausente em estado guardado antes da Consulta cadastral */
  consultas?: ConsultaFeita[]
  /** ausente em estado guardado antes do cadastro de Imóveis */
  imoveis?: ImovelGestao[]
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
  const config = useState<ConfiguracoesGestao>('gestao:config', () => configuracoesPadrao())
  const consultas = useState<ConsultaFeita[]>('gestao:consultas', () => [])
  const imoveis = useState<ImovelGestao[]>('gestao:imoveis', () => [])
  const carregado = useState<boolean>('gestao:carregado', () => false)
  const { sessao } = useGestaoSessao()

  /** `false` quando não coube (localStorage cheio): quem guarda foto precisa saber, senão ela some no recarregar. */
  function persistir(): boolean {
    if (!import.meta.client) return true
    try {
      localStorage.setItem(CHAVE, JSON.stringify({ ...estado.value, matriz: matriz.value, config: config.value, consultas: consultas.value, imoveis: imoveis.value } satisfies Guardado))
      return true
    } catch {
      /* sem persistência: o demo segue em memória */
      return false
    }
  }

  const imoveisRepo = new MockImoveisRepository(
    {
      ler: () => imoveis.value,
      gravar(lista) {
        const antes = imoveis.value
        imoveis.value = lista
        if (persistir()) return true
        imoveis.value = antes
        return false
      },
    },
    () => new Date().toISOString(),
    () => `ft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
  )

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
            config.value = g.config ?? configuracoesPadrao()
            consultas.value = Array.isArray(g.consultas) ? g.consultas : []
            imoveis.value = Array.isArray(g.imoveis) ? g.imoveis : imoveisSeed()
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
    config.value = configuracoesPadrao()
    consultas.value = []
    imoveis.value = imoveisSeed()
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

  /** Faz a consulta (simulada), grava no histórico e devolve o resultado para a tela. */
  function consultar(entrada: EntradaConsulta): ResultadoConsulta {
    const r = realizarConsulta(entrada, { nome: sessao.value?.nome ?? 'Sistema' }, agora(), proximoIdConsulta(consultas.value))
    if (r.ok) {
      consultas.value = [r.consulta, ...consultas.value]
      persistir()
    }
    return r
  }

  const NEGADO = { ok: false, erro: 'Você não pode alterar este imóvel.' } as const

  const permissoesDoImovel = (imovel: ImovelGestao | null): PermissoesImovel =>
    sessao.value
      ? permissoesImovel(matriz.value, sessao.value, imovel)
      : { ver: false, criar: false, editar: false, excluir: false, trocarCorretor: false }

  /** Checa a permissão no domínio e só então chama o repositório (o servidor repete a checagem). */
  function comPermissao<T>(id: string, chave: 'editar', fazer: () => Promise<T>): Promise<T | typeof NEGADO> {
    const imovel = imoveis.value.find((i) => i.id === id) ?? null
    return imovel && !permissoesDoImovel(imovel)[chave] ? Promise.resolve(NEGADO) : fazer()
  }

  async function cadastrarImovel(dados: NovoImovel): Promise<ResultadoImovel> {
    if (!permissoesDoImovel(null).criar) return { ok: false, erro: 'Você não pode cadastrar imóveis.' }
    // Corretor só cadastra para si; trocar o vendedor é de quem vê todos.
    const brokerId = permissoesDoImovel(null).trocarCorretor ? dados.brokerId : (sessao.value?.corretorId ?? dados.brokerId)
    return imoveisRepo.criar({ ...dados, brokerId })
  }

  const atualizarImovel = (id: string, dados: NovoImovel) =>
    comPermissao(id, 'editar', () => {
      const atual = imoveis.value.find((i) => i.id === id)
      const brokerId = permissoesDoImovel(atual ?? null).trocarCorretor ? dados.brokerId : (atual?.brokerId ?? dados.brokerId)
      return imoveisRepo.atualizar(id, { ...dados, brokerId })
    })

  const mudarStatusImovel = (id: string, status: PropertyStatus) => comPermissao(id, 'editar', () => imoveisRepo.mudarStatus(id, status))
  const definirDestaqueImovel = (id: string, featured: boolean) => comPermissao(id, 'editar', () => imoveisRepo.definirDestaque(id, featured))
  const adicionarFotosImovel = (id: string, novas: FotoNova[]) => comPermissao(id, 'editar', () => imoveisRepo.adicionarFotos(id, novas))
  const definirCapaImovel = (id: string, fotoId: string) => comPermissao(id, 'editar', () => imoveisRepo.definirCapa(id, fotoId))
  const moverFotoImovel = (id: string, fotoId: string, dir: 'cima' | 'baixo') => comPermissao(id, 'editar', () => imoveisRepo.moverFoto(id, fotoId, dir))
  const removerFotoImovel = (id: string, fotoId: string) => comPermissao(id, 'editar', () => imoveisRepo.removerFoto(id, fotoId))

  async function excluirImovel(id: string): Promise<{ ok: true } | { ok: false; erro: string }> {
    const imovel = imoveis.value.find((i) => i.id === id)
    if (!imovel || !sessao.value) return { ok: false, erro: 'Imóvel não encontrado.' }
    const pode = podeExcluirImovel(imovel, sessao.value, matriz.value, estado.value.locacoes)
    return pode.ok ? imoveisRepo.excluir(id) : pode
  }

  /** Guarda as configurações já validadas por `validarConfiguracoes`. */
  function definirConfig(nova: ConfiguracoesGestao) {
    config.value = nova
    persistir()
  }

  /** Troca a matriz de permissões e guarda. A validação (travas do Dono) é de `alterarPermissao`. */
  function definirMatriz(nova: MatrizPermissoes) {
    matriz.value = nova
    persistir()
  }

  /**
   * Matriz vigente para quem precisa dela ANTES de `carregar()`: a guarda de rota roda
   * antes do layout. Sem isto, recarregar a página validaria a rota com a matriz padrão
   * e abriria uma tela que o Dono acabou de fechar para aquele perfil.
   */
  function matrizAtual(): MatrizPermissoes {
    if (carregado.value) return matriz.value
    if (import.meta.client) {
      try {
        const g = JSON.parse(localStorage.getItem(CHAVE) ?? 'null') as Guardado | null
        if (g?.matriz) return g.matriz
      } catch {
        /* guardado corrompido: cai no padrão */
      }
    }
    return matrizPadrao()
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
    consultar,
    consultas: computed(() => consultas.value),
    imoveis: computed(() => imoveis.value),
    imoveisVisiveis: computed(() => (sessao.value ? filtrarImoveisVisiveis(matriz.value, sessao.value, imoveis.value) : [])),
    permissoesDoImovel,
    cadastrarImovel,
    atualizarImovel,
    mudarStatusImovel,
    definirDestaqueImovel,
    excluirImovel,
    adicionarFotosImovel,
    definirCapaImovel,
    moverFotoImovel,
    removerFotoImovel,
    definirMatriz,
    config,
    definirConfig,
    matrizAtual,
    aplicar,
    caps,
    acoes,
    agora,
  }
}
