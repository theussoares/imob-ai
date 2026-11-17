import { agora, type Estado, type NovoProcesso } from '../../domain/acoes'
import type { NovaLocacao } from '../../domain/acoes-locacao'
import { configuracoesPadrao, type ConfiguracoesGestao } from '../../domain/configuracoes'
import type { ConsultaFeita, EntradaConsulta } from '../../domain/consulta'
import { capacidades, locacoesVisiveis as filtrarLocacoesVisiveis, matrizPadrao, processosVisiveis } from '../../domain/permissions'
import { imoveisSeed, type ImovelGestao } from '../../domain/imoveis'
import { imoveisVisiveis as filtrarImoveisVisiveis, permissoesImovel, podeExcluirImovel, type NovoImovel, type PermissoesImovel, type ResultadoImovel } from '../../domain/imoveis-acoes'
import type { FotoNova } from '../../domain/imoveis-fotos'
import type { PropertyStatus } from '~~/shared/models/property'
import { locacoesSeed } from '../../domain/locacao-seed'
import { CORRETORES, documentosSeedCompleto, processosSeed } from '../../domain/seed'
import type { CategoriaDocumento, Corretor, Documento, Locacao, MatrizPermissoes, Processo } from '../../domain/types'
import { HttpGestaoRepository } from '../services/HttpGestaoRepository'
import { HttpImoveisRepository } from '../services/HttpImoveisRepository'
import type { ArmazemGestao, ArquivoGestao, DadosGestao, GestaoRepository, Mudanca, Resultado, TipoAlvo } from '../services/GestaoRepository'
import type { ImoveisRepository } from '../services/ImoveisRepository'
import { MockGestaoRepository } from '../services/MockGestaoRepository'
import { MockImoveisRepository } from '../services/MockImoveisRepository'

// v5: o imóvel ganhou os campos do catálogo (preço, bairro, fotos, corretor vendedor…); o v4 guardado
// traria o cadastro de 6 campos. (v4: o seed da locação passou a ser ancorado em «hoje».)
const CHAVE = 'gestao-demo-v5'

/** Quantos processos a página «Documentos» carrega em `http` (não há listagem global; é uma chamada por processo). */
const LIMITE_DOCUMENTOS_GLOBAIS = 50
const PARALELO_DOCUMENTOS = 6

interface Guardado extends Estado {
  matriz: MatrizPermissoes
  /** ausente em estado guardado antes das Configurações: cai no padrão */
  config?: ConfiguracoesGestao
  /** ausente em estado guardado antes da Consulta cadastral */
  consultas?: ConsultaFeita[]
  /** ausente em estado guardado antes do cadastro de Imóveis */
  imoveis?: ImovelGestao[]
}

const trocarOuPor = <T extends { id: string }>(lista: T[], novo: T): T[] =>
  lista.some((x) => x.id === novo.id) ? lista.map((x) => (x.id === novo.id ? novo : x)) : [novo, ...lista]

/**
 * Dados do painel. Delega ao repository escolhido por `NUXT_PUBLIC_GESTAO_BACKEND`:
 * `mock` (padrão) roda o domínio puro sobre o localStorage; `http` fala com `/api/gestao/**`,
 * onde a regra roda no servidor. A tela chama o mesmo `executar(...)` nos dois.
 *
 * Mock: parte dos GETs do `mocker-nuxt` e guarda as mutações no cliente — o mocker não tem
 * estado. Se o mock não responde, cai no seed local (ver `MockGestaoRepository`).
 */
export function useGestaoStore() {
  const http = useGestaoHttp()
  const estado = useState<Estado>('gestao:estado', () => ({ processos: [], documentos: [], locacoes: [] }))
  const matriz = useState<MatrizPermissoes>('gestao:matriz', () => matrizPadrao())
  const config = useState<ConfiguracoesGestao>('gestao:config', () => configuracoesPadrao())
  const consultas = useState<ConsultaFeita[]>('gestao:consultas', () => [])
  const imoveis = useState<ImovelGestao[]>('gestao:imoveis', () => [])
  const corretores = useState<Corretor[]>('gestao:corretores', () => CORRETORES)
  const versoes = useState<Record<string, number>>('gestao:versoes', () => ({}))
  const carregado = useState<boolean>('gestao:carregado', () => false)
  const erroCarga = useState<string>('gestao:erro-carga', () => '')
  const { sessao } = useGestaoSessao()

  /** `false` quando não coube (localStorage cheio): quem guarda foto precisa saber, senão ela some no recarregar. */
  function persistir(): boolean {
    if (http || !import.meta.client) return true
    try {
      localStorage.setItem(CHAVE, JSON.stringify({ ...estado.value, matriz: matriz.value, config: config.value, consultas: consultas.value, imoveis: imoveis.value } satisfies Guardado))
      return true
    } catch {
      /* sem persistência: o demo segue em memória */
      return false
    }
  }

  const lerBlob = (): Guardado | null => {
    if (!import.meta.client) return null
    try {
      const g = JSON.parse(localStorage.getItem(CHAVE) ?? 'null') as Guardado | null
      return g && Array.isArray(g.processos) && Array.isArray(g.documentos) && Array.isArray(g.locacoes) ? g : null
    } catch {
      return null // guardado corrompido: recarrega do seed
    }
  }

  const aplicarDados = (d: DadosGestao) => {
    estado.value = { processos: d.processos, documentos: d.documentos, locacoes: d.locacoes }
    matriz.value = d.matriz
    config.value = d.config
    consultas.value = d.consultas
    corretores.value = d.corretores
  }

  const instantaneo = (): DadosGestao => ({ ...estado.value, matriz: matriz.value, config: config.value, consultas: consultas.value, corretores: corretores.value })

  const armazem: ArmazemGestao = {
    ler: instantaneo,
    gravar(d) {
      aplicarDados(d)
      // Sem espaço no localStorage o demo segue em memória (como sempre foi): só foto e imóvel
      // são recusados por falta de espaço, porque somem no recarregar.
      persistir()
      return true
    },
    lerPersistido() {
      const g = lerBlob()
      return g
        ? { processos: g.processos, documentos: g.documentos, locacoes: g.locacoes, matriz: g.matriz ?? matrizPadrao(), config: g.config ?? configuracoesPadrao(), consultas: Array.isArray(g.consultas) ? g.consultas : [], corretores: CORRETORES }
        : null
    },
    limparPersistido() {
      try {
        localStorage.removeItem(CHAVE)
      } catch {
        /* idem */
      }
    },
  }

  const ator = () => ({ nome: sessao.value?.nome ?? 'Sistema' })

  const api = http ? useGestaoApi() : null
  const repo: GestaoRepository = api
    ? new HttpGestaoRepository(api, { ler: (k) => versoes.value[k], gravar: (k, v) => void (versoes.value[k] = v) }, () => sessao.value?.perfil ?? null)
    : new MockGestaoRepository(armazem, ator, async () => {
        const [p, d, l, m] = await Promise.all([
          $fetch<{ data: Processo[] }>('/api/gestao/processos'),
          $fetch<{ data: Documento[] }>('/api/gestao/documentos'),
          $fetch<{ data: Locacao[] }>('/api/gestao/locacoes'),
          $fetch<{ data: MatrizPermissoes }>('/api/gestao/permissoes'),
        ])
        return { processos: p.data, documentos: d.data, locacoes: l.data, matriz: m.data }
      })

  const imoveisRepo: ImoveisRepository = api
    ? new HttpImoveisRepository(api)
    : new MockImoveisRepository(
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
    erroCarga.value = ''
    // Lido ANTES: `repo.carregar()` regrava o guardado e, nesse instante, `imoveis` ainda está vazio.
    const imoveisGuardados = lerBlob()?.imoveis
    try {
      aplicarDados(await repo.carregar())
    } catch (e) {
      // Em `http` o servidor pode estar fora do ar; a tela mostra o aviso em vez de quebrar.
      // (`mock` não lança: o repository cai no seed.)
      erroCarga.value = (e as { message?: string } | null)?.message || 'Não foi possível carregar os dados.'
      return
    }
    if (http) {
      try {
        imoveis.value = await imoveisRepo.listar()
      } catch {
        imoveis.value = []
        erroCarga.value = 'Não foi possível carregar os imóveis.'
      }
    } else {
      imoveis.value = imoveisGuardados ?? imoveisSeed()
    }
    carregado.value = true
    persistir()
  }

  /** Volta ao seed e apaga o que foi feito no demo. Só `mock`. */
  async function restaurar() {
    if (http) return
    ;(repo as MockGestaoRepository).restaurar()
    await carregar(true)
  }

  /** Troca no estado só o que a ação mudou. Idempotente: o mock já gravou o mesmo pelo armazém. */
  function aplicarMudanca(m: Mudanca) {
    const e = estado.value
    estado.value = {
      processos: m.processo ? trocarOuPor(e.processos, m.processo) : e.processos,
      locacoes: m.locacao ? trocarOuPor(e.locacoes, m.locacao) : e.locacoes,
      documentos: m.documento ? trocarOuPor(e.documentos, m.documento) : e.documentos,
    }
    persistir()
  }

  /** Ação de venda/locação por NOME, a mesma chave que o servidor despacha. */
  async function executar(tipo: TipoAlvo, id: string, acao: string, dados: unknown = {}): Promise<Resultado<Mudanca>> {
    const r = await repo.executar(tipo, id, acao, dados)
    if (r.ok) {
      aplicarMudanca(r)
      return r
    }
    // 409: outra pessoa gravou antes. A mensagem do servidor já diz «alterada por outra pessoa»;
    // relemos o agregado para a tela mostrar o que ficou e a próxima tentativa valer.
    if (r.conflito) {
      const novo = await repo.recarregar(tipo, id)
      if (novo.ok) aplicarMudanca(novo)
    }
    return r
  }

  /**
   * `http`: a lista traz o CPF das partes MASCARADO (regra do servidor para listagem); o formulário
   * do contrato precisa do dado inteiro, senão salvar regravaria o CPF mascarado. A página do
   * contrato chama isto ao abrir. Também renova a `versao` que a próxima ação vai devolver.
   */
  async function carregarDetalhe(tipo: TipoAlvo, id: string) {
    if (!http) return
    const r = await repo.recarregar(tipo, id)
    if (r.ok) aplicarMudanca(r)
  }

  const abrirProcesso = async (dados: NovoProcesso) => comAplicar(await repo.abrirVenda(dados))
  const abrirLocacao = async (dados: NovaLocacao) => comAplicar(await repo.abrirLocacao(dados))

  function comAplicar<T extends Resultado<Mudanca>>(r: T): T {
    if (r.ok) aplicarMudanca(r)
    return r
  }

  // --- documentos ---------------------------------------------------------------------------

  const tipoDoAlvo = (id: string): TipoAlvo => (estado.value.processos.some((p) => p.id === id) ? 'venda' : 'locacao')

  /** Mescla o que veio do servidor: troca os documentos do alvo que não estão na lixeira. */
  function mesclarDocumentosDoAlvo(id: string, novos: Documento[]) {
    estado.value = { ...estado.value, documentos: [...novos, ...estado.value.documentos.filter((d) => d.processoId !== id || d.apagado)] }
  }

  /** `http`: busca os documentos de um processo/locação (a página dele chama ao abrir). `mock`: já estão em memória. */
  async function carregarDocumentos(tipo: TipoAlvo, id: string) {
    if (!http) return
    try {
      mesclarDocumentosDoAlvo(id, await repo.documentosDoAlvo(tipo, id))
    } catch {
      /* a tela segue com o que tem; a próxima ação mostra o erro de verdade */
    }
  }

  /** Página «Documentos»: não há listagem global, então busca por processo visível (limite e paralelismo fixos) + lixeira. */
  async function carregarDocumentosDaPagina() {
    if (!http) return
    const alvos = processosVisiveis(matriz.value, sessao.value!, estado.value.processos).slice(0, LIMITE_DOCUMENTOS_GLOBAIS)
    for (let i = 0; i < alvos.length; i += PARALELO_DOCUMENTOS) {
      await Promise.all(alvos.slice(i, i + PARALELO_DOCUMENTOS).map((p) => carregarDocumentos('venda', p.id)))
    }
    if (caps()?.apagarDocs) {
      try {
        const lixo = await repo.lixeira()
        estado.value = { ...estado.value, documentos: [...estado.value.documentos.filter((d) => !d.apagado), ...lixo] }
      } catch {
        /* idem */
      }
    }
  }

  const enviarDocumento = async (tipo: TipoAlvo, id: string, arquivo: ArquivoGestao, extra: { categoria: CategoriaDocumento; requisito?: string }) =>
    comAplicar(await repo.enviarDocumento({ tipo, id }, arquivo, extra))
  const novaVersaoDocumento = async (doc: Documento, arquivo: ArquivoGestao) => comAplicar(await repo.novaVersaoDocumento(doc, tipoDoAlvo(doc.processoId), arquivo))
  const conferirDocumento = async (doc: Documento) => comAplicar(await repo.conferirDocumento(doc))
  const apagarDocumento = async (doc: Documento) => comAplicar(await repo.apagarDocumento(doc))
  const restaurarDocumento = async (doc: Documento) => comAplicar(await repo.restaurarDocumento(doc))
  const baixarDocumento = (doc: Documento) => repo.baixarDocumento(doc)

  // --- consulta, configurações e matriz -----------------------------------------------------

  /** Faz a consulta (simulada), grava no histórico e devolve o resultado para a tela. */
  async function consultar(entrada: EntradaConsulta) {
    const r = await repo.consultar(entrada)
    if (r.ok && !consultas.value.some((c) => c.id === r.consulta.id)) {
      consultas.value = [r.consulta, ...consultas.value]
      persistir()
    }
    return r
  }

  /** Guarda as configurações já validadas por `validarConfiguracoes`. */
  async function definirConfig(nova: ConfiguracoesGestao) {
    const r = await repo.salvarConfig(nova)
    if (r.ok) {
      config.value = r.config
      persistir()
    }
    return r
  }

  /** Troca a matriz de permissões e guarda. A validação (travas do Dono) é de `alterarPermissao`; o servidor a repete. */
  async function definirMatriz(nova: MatrizPermissoes) {
    const r = await repo.salvarMatriz(nova)
    if (r.ok) {
      matriz.value = r.matriz
      persistir()
    }
    return r
  }

  // --- imóveis ------------------------------------------------------------------------------

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

  /** O repository devolve o imóvel inteiro; em `http` é ele (e não uma conta local) que manda na lista. */
  async function guardarImovel(r: ResultadoImovel): Promise<ResultadoImovel> {
    if (http && r.ok) imoveis.value = trocarOuPor(imoveis.value, r.imovel)
    return r
  }

  async function cadastrarImovel(dados: NovoImovel): Promise<ResultadoImovel> {
    if (!permissoesDoImovel(null).criar) return { ok: false, erro: 'Você não pode cadastrar imóveis.' }
    // Corretor só cadastra para si; trocar o vendedor é de quem vê todos.
    const brokerId = permissoesDoImovel(null).trocarCorretor ? dados.brokerId : (sessao.value?.corretorId ?? dados.brokerId)
    return guardarImovel(await imoveisRepo.criar({ ...dados, brokerId }))
  }

  const atualizarImovel = (id: string, dados: NovoImovel) =>
    comPermissao(id, 'editar', async () => {
      const atual = imoveis.value.find((i) => i.id === id)
      const brokerId = permissoesDoImovel(atual ?? null).trocarCorretor ? dados.brokerId : (atual?.brokerId ?? dados.brokerId)
      return guardarImovel(await imoveisRepo.atualizar(id, { ...dados, brokerId }))
    })

  const mudarStatusImovel = (id: string, status: PropertyStatus) => comPermissao(id, 'editar', async () => guardarImovel(await imoveisRepo.mudarStatus(id, status)))
  const definirDestaqueImovel = (id: string, featured: boolean) => comPermissao(id, 'editar', async () => guardarImovel(await imoveisRepo.definirDestaque(id, featured)))
  const adicionarFotosImovel = (id: string, novas: FotoNova[]) => comPermissao(id, 'editar', async () => guardarImovel(await imoveisRepo.adicionarFotos(id, novas)))
  const definirCapaImovel = (id: string, fotoId: string) => comPermissao(id, 'editar', async () => guardarImovel(await imoveisRepo.definirCapa(id, fotoId)))
  const moverFotoImovel = (id: string, fotoId: string, dir: 'cima' | 'baixo') => comPermissao(id, 'editar', async () => guardarImovel(await imoveisRepo.moverFoto(id, fotoId, dir)))
  const removerFotoImovel = (id: string, fotoId: string) => comPermissao(id, 'editar', async () => guardarImovel(await imoveisRepo.removerFoto(id, fotoId)))

  async function excluirImovel(id: string): Promise<{ ok: true } | { ok: false; erro: string }> {
    const imovel = imoveis.value.find((i) => i.id === id)
    if (!imovel || !sessao.value) return { ok: false, erro: 'Imóvel não encontrado.' }
    const pode = podeExcluirImovel(imovel, sessao.value, matriz.value, estado.value.locacoes)
    if (!pode.ok) return pode
    const r = await imoveisRepo.excluir(id)
    if (http && r.ok) imoveis.value = imoveis.value.filter((i) => i.id !== id)
    return r
  }

  /**
   * Matriz vigente para quem precisa dela ANTES de `carregar()`: a guarda de rota roda
   * antes do layout. Sem isto, recarregar a página validaria a rota com a matriz padrão
   * e abriria uma tela que o Dono acabou de fechar para aquele perfil.
   * Em `http` a matriz vem da sessão (`/api/gestao/sessao`), já gravada no estado.
   */
  function matrizAtual(): MatrizPermissoes {
    if (http || carregado.value) return matriz.value
    return lerBlob()?.matriz ?? matrizPadrao()
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
    http,
    locacoes: computed(() => estado.value.locacoes),
    locacoesVisiveis,
    processos: computed(() => estado.value.processos),
    documentos: computed(() => estado.value.documentos),
    corretores,
    matriz,
    visiveis,
    carregado,
    erroCarga,
    carregar,
    restaurar,
    executar,
    carregarDetalhe,
    abrirProcesso,
    abrirLocacao,
    carregarDocumentos,
    carregarDocumentosDaPagina,
    enviarDocumento,
    novaVersaoDocumento,
    conferirDocumento,
    apagarDocumento,
    restaurarDocumento,
    baixarDocumento,
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
    caps,
    agora,
  }
}
