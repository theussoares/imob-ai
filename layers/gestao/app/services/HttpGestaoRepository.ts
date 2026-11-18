import type { NovoProcesso } from '../../domain/acoes'
import type { NovaLocacao } from '../../domain/acoes-locacao'
import { configuracoesPadrao, type ConfiguracoesGestao } from '../../domain/configuracoes'
import type { ConsultaFeita, EntradaConsulta } from '../../domain/consulta'
import type { CategoriaDocumento, Corretor, Documento, Locacao, MatrizPermissoes, Perfil, Processo } from '../../domain/types'
import { type FiltroListaDocumentos, type PaginaDocumentos, queryDosDocumentos } from '../../domain/documentos'
import type { ResumoDashboard } from '../../domain/dashboard'
import type { RespostaFinanceiro } from '../../domain/financeiro'
import type { PaginaComContagens } from '../../domain/paginacao'
import { type ClienteGestao, ErroGestao, paraFalha } from './clienteGestao'
import type { ArquivoGestao, DadosGestao, EscopoCarga, GestaoRepository, Mudanca, Resultado, TipoAlvo } from './GestaoRepository'

/** Onde ficam as versões lidas (`useState`, compartilhado entre componentes): `venda:V-…` / `locacao:L-…`. */
export interface ArmazemVersoes {
  ler(chave: string): number | undefined
  gravar(chave: string, versao: number): void
}

/** Sobe o arquivo para a URL assinada do Storage. Injetável: o teste não tem rede. */
export type Subir = (uploadUrl: string, arquivo: Blob, mime: string) => Promise<void>

/** Mesmo caminho do `uploadToSignedUrl` do supabase-js: PUT multipart, o arquivo no campo sem nome. */
export const subirParaUrlAssinada: Subir = async (uploadUrl, arquivo) => {
  const form = new FormData()
  form.append('cacheControl', '3600')
  form.append('', arquivo)
  const r = await fetch(uploadUrl, { method: 'PUT', body: form, headers: { 'x-upsert': 'false' } })
  if (!r.ok) throw new Error(`upload ${r.status}`)
}

const MIME_POR_EXTENSAO: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

const mimeDe = (a: ArquivoGestao): string => a.file?.type || MIME_POR_EXTENSAO[a.name.split('.').pop()?.toLowerCase() ?? ''] || 'application/octet-stream'

const FIN_VAZIO = { forma: 'À vista', financiado: 0, entrada: 0, fgts: 0, proprios: 0 } as const

/**
 * Perfil sem `valores` recebe o processo SEM `pct`, `adiantamentos` e `fin` (o servidor recorta).
 * As telas leem esses campos sem checar, então entram vazios aqui — nunca inventados: a tela
 * de quem não vê valores não os mostra.
 */
export function normalizarProcesso(p: Partial<Processo> & Pick<Processo, 'id'>): Processo {
  return { pct: 0, adiantamentos: [], fin: { ...FIN_VAZIO }, ...p } as Processo
}

/** Idem para a locação: contrato e cobranças chegam sem valor, taxa e repasse. */
export function normalizarLocacao(l: Locacao): Locacao {
  return {
    ...l,
    ...(l.contrato && { contrato: { ...l.contrato, valor: l.contrato.valor ?? 0, taxaPct: l.contrato.taxaPct ?? 0 } }),
    cobrancas: (l.cobrancas ?? []).map((c) => ({ ...c, valor: c.valor ?? 0 })),
  }
}

/** O que a lista paginada pede ao servidor. */
export interface FiltroPagina {
  pagina: number
  q: string
  status: string
  /** Lista os arquivados (exige poder vê-los; o servidor repete a checagem). */
  arquivados?: boolean
}

const consultaDaPagina = (f: FiltroPagina, chaveArquivados: 'arquivados' | 'arquivadas') => ({ pagina: f.pagina, ...(f.arquivados ? { [chaveArquivados]: 1 } : {}), ...(f.q.trim() ? { q: f.q.trim() } : {}), ...(f.status ? { status: f.status } : {}) })

interface RespostaVenda {
  versao: number
  processo: Processo
}
interface RespostaLocacao {
  versao: number
  locacao: Locacao
}

const alvoParam = (tipo: TipoAlvo, id: string) => `${tipo}:${id}`

/**
 * `GestaoRepository` sobre `/api/gestao/**`. A regra (permissão, domínio, comissão, histórico) é
 * do servidor; aqui só: montar a chamada, guardar a `versao` de cada agregado para devolvê-la na
 * próxima ação, e traduzir o erro em `Falha` (409 → conflito, 422 → frase do domínio).
 */
export class HttpGestaoRepository implements GestaoRepository {
  constructor(
    private readonly api: ClienteGestao,
    private readonly versoes: ArmazemVersoes,
    private readonly perfil: () => Perfil | null,
    private readonly subir: Subir = subirParaUrlAssinada,
  ) {}

  private async tentar<T extends object>(fn: () => Promise<T>): Promise<({ ok: true } & T) | Extract<Resultado, { ok: false }>> {
    try {
      return { ok: true, ...(await fn()) }
    } catch (e) {
      return paraFalha(e)
    }
  }

  private guardarVenda(r: RespostaVenda): Processo {
    this.versoes.gravar(`venda:${r.processo.id}`, r.versao)
    return normalizarProcesso(r.processo)
  }

  private guardarLocacao(r: RespostaLocacao): Locacao {
    this.versoes.gravar(`locacao:${r.locacao.id}`, r.versao)
    return normalizarLocacao(r.locacao)
  }

  /**
   * Carrega só as fatias pedidas. `matrizAtual` é a que o store já tem: sem 'base' na lista, ela decide o
   * que o perfil pode ler (arquivados, configurações, consultas) sem outra ida ao servidor.
   * Cada fatia só aparece no retorno se foi buscada; o store mescla.
   */
  async carregarParcial(escopos: readonly EscopoCarga[], matrizAtual: MatrizPermissoes): Promise<Partial<DadosGestao>> {
    const quer = new Set(escopos)
    const out: Partial<DadosGestao> = {}
    const matriz = quer.has('base') ? (await this.api.get<{ matriz: MatrizPermissoes }>('/api/gestao/matriz')).matriz : matrizAtual
    if (quer.has('base')) out.matriz = matriz
    const perfil = this.perfil()
    const tem = (k: keyof MatrizPermissoes) => !!perfil && matriz[k]?.[perfil] === 'sim'
    const veArquivados = tem('arquivar') || tem('apagarDocs')

    const tarefas: Promise<void>[] = []
    if (quer.has('vendas')) {
      tarefas.push(Promise.all([
        this.api.get<RespostaVenda[]>('/api/gestao/vendas'),
        veArquivados ? this.api.get<RespostaVenda[]>('/api/gestao/vendas', { arquivados: 1 }) : Promise.resolve([] as RespostaVenda[]),
      ]).then(([a, b]) => { out.processos = [...a, ...b].map((r) => this.guardarVenda(r)) }))
    }
    if (quer.has('locacoes')) {
      tarefas.push(Promise.all([
        this.api.get<{ locacoes: RespostaLocacao[] }>('/api/gestao/locacoes'),
        veArquivados ? this.api.get<{ locacoes: RespostaLocacao[] }>('/api/gestao/locacoes', { arquivadas: 1 }) : Promise.resolve({ locacoes: [] as RespostaLocacao[] }),
      ]).then(([a, b]) => { out.locacoes = [...a.locacoes, ...b.locacoes].map((r) => this.guardarLocacao(r)) }))
    }
    if (quer.has('corretores')) tarefas.push(this.api.get<{ corretores: Corretor[] }>('/api/gestao/corretores').then((r) => { out.corretores = r.corretores }))
    if (quer.has('config')) {
      // Só o Dono lê as configurações (a tela também é só dele); os demais ficam com o padrão.
      tarefas.push((tem('admin') ? this.api.get<{ config: ConfiguracoesGestao }>('/api/gestao/configuracoes') : Promise.resolve({ config: configuracoesPadrao() })).then((r) => { out.config = r.config }))
    }
    if (quer.has('consultas')) {
      tarefas.push((tem('consulta') ? this.api.get<{ consultas: ConsultaFeita[] }>('/api/gestao/consultas') : Promise.resolve({ consultas: [] as ConsultaFeita[] })).then((r) => { out.consultas = r.consultas }))
    }
    await Promise.all(tarefas)
    return out
  }

  async carregar(): Promise<DadosGestao> {
    const { matriz } = await this.api.get<{ matriz: MatrizPermissoes }>('/api/gestao/matriz')
    const perfil = this.perfil()
    const tem = (k: keyof MatrizPermissoes) => !!perfil && matriz[k]?.[perfil] === 'sim'
    const veArquivados = tem('arquivar') || tem('apagarDocs')

    const [vendas, vendasArq, locacoes, locacoesArq, corretores, config, consultas] = await Promise.all([
      this.api.get<RespostaVenda[]>('/api/gestao/vendas'),
      veArquivados ? this.api.get<RespostaVenda[]>('/api/gestao/vendas', { arquivados: 1 }) : Promise.resolve([]),
      this.api.get<{ locacoes: RespostaLocacao[] }>('/api/gestao/locacoes'),
      veArquivados ? this.api.get<{ locacoes: RespostaLocacao[] }>('/api/gestao/locacoes', { arquivadas: 1 }) : Promise.resolve({ locacoes: [] }),
      this.api.get<{ corretores: Corretor[] }>('/api/gestao/corretores'),
      // Só o Dono lê as configurações (a tela também é só dele); os demais ficam com o padrão.
      tem('admin') ? this.api.get<{ config: ConfiguracoesGestao }>('/api/gestao/configuracoes') : Promise.resolve({ config: configuracoesPadrao() }),
      tem('consulta') ? this.api.get<{ consultas: ConsultaFeita[] }>('/api/gestao/consultas') : Promise.resolve({ consultas: [] }),
    ])

    return {
      processos: [...vendas, ...vendasArq].map((r) => this.guardarVenda(r)),
      locacoes: [...locacoes.locacoes, ...locacoesArq.locacoes].map((r) => this.guardarLocacao(r)),
      // Não há listagem global: os documentos vêm por processo (`documentosDoAlvo`) quando a tela os pede.
      documentos: [],
      matriz,
      config: config.config,
      consultas: consultas.consultas,
      corretores: corretores.corretores,
    }
  }

  /** Totais calculados no servidor sobre TODOS os contratos do escopo (a lista do store tem só os 200 mais recentes). */
  financeiro(competencia: string): Promise<RespostaFinanceiro> {
    return this.api.get<RespostaFinanceiro>('/api/gestao/financeiro', competencia ? { competencia } : undefined)
  }

  dashboard(): Promise<ResumoDashboard & { truncado: boolean }> {
    return this.api.get<ResumoDashboard & { truncado: boolean }>('/api/gestao/dashboard')
  }

  /**
   * Uma página da lista de vendas, filtrada NO SERVIDOR: a tela só tem as 24 da página, não a carteira
   * inteira. Falha sobe (a tela mostra «tentar de novo»), como em `carregar`. `q` e `status` vazios não vão.
   */
  /** Uma página da tela Documentos (abas, categoria, busca), filtrada no servidor. */
  paginaDocumentos(f: FiltroListaDocumentos): Promise<PaginaDocumentos> {
    return this.api.get<PaginaDocumentos>('/api/gestao/documentos/pagina', queryDosDocumentos(f))
  }

  async paginaVendas(f: FiltroPagina): Promise<PaginaComContagens<Processo>> {
    const r = await this.api.get<PaginaComContagens<RespostaVenda>>('/api/gestao/vendas', consultaDaPagina(f, 'arquivados'))
    return { ...r, itens: r.itens.map((i) => this.guardarVenda(i)) }
  }

  async paginaLocacoes(f: FiltroPagina): Promise<PaginaComContagens<Locacao>> {
    const r = await this.api.get<PaginaComContagens<RespostaLocacao>>('/api/gestao/locacoes', consultaDaPagina(f, 'arquivadas'))
    return { ...r, itens: r.itens.map((i) => this.guardarLocacao(i)) }
  }

  abrirVenda(d: NovoProcesso): Promise<Resultado<Mudanca>> {
    // `pct` não vai: a comissão padrão é a das configurações, lida no servidor.
    const corpo = { imovel: d.imovel, imovelId: d.imovelId, vendedor: d.vendedor, comprador: d.comprador, corretorId: d.corretorId, captadorId: d.captadorId }
    return this.tentar(async () => ({ processo: this.guardarVenda(await this.api.post<RespostaVenda>('/api/gestao/vendas', corpo)) }))
  }

  abrirLocacao(d: NovaLocacao): Promise<Resultado<Mudanca>> {
    const corpo = { locador: d.locador, locatario: d.locatario, imovelId: d.imovelId, imovel: d.imovel, corretorId: d.corretorId }
    return this.tentar(async () => ({ locacao: this.guardarLocacao(await this.api.post<RespostaLocacao>('/api/gestao/locacoes', corpo)) }))
  }

  executar(tipo: TipoAlvo, id: string, acao: string, dados: unknown = {}): Promise<Resultado<Mudanca>> {
    return this.tentar(async () => {
      const versao = this.versoes.ler(`${tipo}:${id}`)
      if (tipo === 'venda') {
        // O servidor exige a `versao` que a tela leu (sem ela, 422; defasada, 409), nos dois tipos.
        const r = await this.api.post<RespostaVenda>(`/api/gestao/vendas/${encodeURIComponent(id)}/acoes`, { acao, dados, versao })
        return { processo: this.guardarVenda(r) }
      }
      const r = await this.api.post<RespostaLocacao>(`/api/gestao/locacoes/${encodeURIComponent(id)}/acoes`, { acao, dados, versao })
      return { locacao: this.guardarLocacao(r) }
    })
  }

  recarregar(tipo: TipoAlvo, id: string): Promise<Resultado<Mudanca>> {
    return this.tentar(async () =>
      tipo === 'venda'
        ? { processo: this.guardarVenda(await this.api.get<RespostaVenda>(`/api/gestao/vendas/${encodeURIComponent(id)}`)) }
        : { locacao: this.guardarLocacao(await this.api.get<RespostaLocacao>(`/api/gestao/locacoes/${encodeURIComponent(id)}`)) },
    )
  }

  async documentosDoAlvo(tipo: TipoAlvo, id: string): Promise<Documento[]> {
    return this.api.get<Documento[]>('/api/gestao/documentos', { alvo: alvoParam(tipo, id) })
  }

  async lixeira(): Promise<Documento[]> {
    return this.api.get<Documento[]>('/api/gestao/documentos/lixeira')
  }

  /**
   * Três passos, o do meio direto no Storage (o corpo da função da Vercel não passa de 4,5 MB):
   * 1) o servidor valida o DECLARADO e devolve a URL assinada; 2) o arquivo sobe; 3) o servidor
   * abre o objeto, confere o formato pelos primeiros bytes e só então grava a versão.
   * Sem o passo 3 o documento fica «pendente» e invisível nas listas.
   */
  /**
   * O servidor liga/desliga `pdf` do processo ao confirmar, apagar ou restaurar um documento da
   * categoria `venda`, e sobe a `versao` dele. Sem reler, a versão guardada fica velha e a PRÓXIMA
   * ação do usuário no processo tomaria 409 sem ninguém ter mexido nele.
   * Só relê nesse caso (um GET a mais só onde a versão de fato mudou). Se a leitura falhar o
   * documento já foi aceito: seguimos sem o processo, e um 409 futuro cai no «recarregar» do store.
   */
  private async comProcessoAtualizado(documento: Documento): Promise<Mudanca> {
    // Id de venda é `V-AAAA-NNNN` (locação é `L-…`): o documento só traz `processoId`, não o tipo.
    if (documento.categoria !== 'venda' || !documento.processoId.startsWith('V-')) return { documento }
    try {
      const r = await this.api.get<RespostaVenda>(`/api/gestao/vendas/${encodeURIComponent(documento.processoId)}`)
      return { documento, processo: this.guardarVenda(r) }
    } catch {
      return { documento }
    }
  }

  private async enviar(corpo: Record<string, unknown>, arquivo: ArquivoGestao): Promise<Documento> {
    if (!arquivo.file) throw new ErroGestao('Escolha um arquivo.', 422)
    const ini = await this.api.post<{ documentoId: string; uploadUrl: string }>('/api/gestao/documentos/upload', {
      ...corpo,
      nome: arquivo.name,
      tamanho: arquivo.size,
      mime: mimeDe(arquivo),
    })
    try {
      await this.subir(ini.uploadUrl, arquivo.file, mimeDe(arquivo))
    } catch {
      throw new ErroGestao('Não foi possível enviar o arquivo. Tente de novo.', 502)
    }
    return this.api.post<Documento>(`/api/gestao/documentos/${ini.documentoId}/confirmar`)
  }

  enviarDocumento(alvo: { tipo: TipoAlvo; id: string }, arquivo: ArquivoGestao, extra: { categoria: CategoriaDocumento; requisito?: string }): Promise<Resultado<Mudanca>> {
    return this.tentar(async () =>
      this.comProcessoAtualizado(await this.enviar({ alvo: alvoParam(alvo.tipo, alvo.id), categoria: extra.categoria, ...(extra.requisito && { requisito: extra.requisito }) }, arquivo)),
    )
  }

  novaVersaoDocumento(doc: Documento, tipo: TipoAlvo, arquivo: ArquivoGestao): Promise<Resultado<Mudanca>> {
    return this.tentar(async () => this.comProcessoAtualizado(await this.enviar({ alvo: alvoParam(tipo, doc.processoId), documentoId: doc.id }, arquivo)))
  }

  private sobre(doc: Documento, rota: 'conferir' | 'apagar' | 'restaurar'): Promise<Resultado<Mudanca>> {
    return this.tentar(async () => {
      const novo = await this.api.post<Documento>(`/api/gestao/documentos/${doc.id}/${rota}`)
      // Conferir não mexe na marca; apagar e restaurar, sim.
      return rota === 'conferir' ? { documento: novo } : this.comProcessoAtualizado(novo)
    })
  }
  conferirDocumento(doc: Documento) {
    return this.sobre(doc, 'conferir')
  }
  apagarDocumento(doc: Documento) {
    return this.sobre(doc, 'apagar')
  }
  restaurarDocumento(doc: Documento) {
    return this.sobre(doc, 'restaurar')
  }

  baixarDocumento(doc: Documento): Promise<Resultado<{ url: string | null }>> {
    return this.tentar(async () => ({ url: (await this.api.get<{ url: string }>(`/api/gestao/documentos/${doc.id}/download`)).url }))
  }

  salvarMatriz(matriz: MatrizPermissoes) {
    return this.tentar(() => this.api.put<{ matriz: MatrizPermissoes }>('/api/gestao/matriz', { matriz }))
  }

  salvarConfig(config: ConfiguracoesGestao) {
    return this.tentar(() => this.api.put<{ config: ConfiguracoesGestao }>('/api/gestao/configuracoes', { config }))
  }

  consultar(entrada: EntradaConsulta) {
    return this.tentar(() => this.api.post<{ consulta: ConsultaFeita }>('/api/gestao/consultas', entrada))
  }
}
