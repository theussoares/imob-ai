import * as acoes from '../../domain/acoes'
import { encargosDaConfig } from '../../domain/configuracoes'
import { agora as agoraDominio, type Ator, type Estado, type NovoProcesso, type Resultado as ResultadoDominio } from '../../domain/acoes'
import { arquivarProcesso, restaurarProcesso, salvarAbertura, salvarAnotacoes, salvarObservacao } from '../../domain/acoes-ciclo'
import * as loc from '../../domain/acoes-locacao'
import type { NovaLocacao } from '../../domain/acoes-locacao'
import { aprovarAnaliseFinanceira, devolverAnaliseFinanceira, enviarAnaliseFinanceira } from '../../domain/acoes-analise'
import { marcarAdiantamentoPago, marcarMatriculaMae, registrarAdiantamento, removerAdiantamento, salvarConferenciaFinal, salvarFinanceiro, salvarImovel, salvarPessoa } from '../../domain/acoes-processo'
import { configuracoesPadrao, type ConfiguracoesGestao } from '../../domain/configuracoes'
import { proximoIdConsulta, realizarConsulta, type ConsultaFeita, type EntradaConsulta } from '../../domain/consulta'
import { completarProcesso } from '../../domain/novo-processo'
import { matrizPadrao } from '../../domain/permissions'
import { CORRETORES, documentosSeedCompleto, processosSeed } from '../../domain/seed'
import { locacoesSeed } from '../../domain/locacao-seed'
import type { CategoriaDocumento, Documento, MatrizPermissoes } from '../../domain/types'
import type {
  ArmazemGestao,
  ArquivoGestao,
  DadosGestao,
  GestaoRepository,
  Mudanca,
  Resultado,
  TipoAlvo,
} from './GestaoRepository'

const SEM_ESPACO = 'Sem espaço para guardar neste navegador. Remova fotos ou imóveis de exemplo.'

// O corpo de `dados` de cada ação é o MESMO que o servidor recebe (ver `gestao-vendas-acoes.ts` e
// `gestao-locacao-acoes.ts`): trocar `mock` por `http` não muda o que a tela envia. O `any` é
// deliberado: o servidor valida com Zod, e aqui a função do domínio já recusa o que não serve.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Fn = (e: Estado, id: string, d: any, a: Ator) => ResultadoDominio

const VENDA: Record<string, Fn> = {
  mudarStatus: (e, id, d, a) => acoes.mudarStatus(e, id, d.status, a),
  concluirEtapa: (e, id, d, a) => acoes.concluirEtapa(e, id, d.etapa, a),
  salvarAbertura: (e, id, d, a) => salvarAbertura(e, id, d, a),
  salvarObservacao: (e, id, d, a) => salvarObservacao(e, id, d.obs, a),
  salvarAnotacoes: (e, id, d, a) => salvarAnotacoes(e, id, d.anotacoes, a),
  arquivarProcesso: (e, id, _d, a) => arquivarProcesso(e, id, a),
  restaurarProcesso: (e, id, _d, a) => restaurarProcesso(e, id, a),
  registrarAdiantamento: (e, id, d, a) => registrarAdiantamento(e, id, d, a),
  removerAdiantamento: (e, id, d, a) => removerAdiantamento(e, id, d.adiantamentoId, a),
  marcarAdiantamentoPago: (e, id, d, a) => marcarAdiantamentoPago(e, id, d.adiantamentoId, d, a),
  salvarFinanceiro: (e, id, d, a) => salvarFinanceiro(e, id, d, a),
  salvarPessoa: (e, id, d, a) => salvarPessoa(e, id, d.quem, { cpf: d.cpf, telefone: d.telefone, email: d.email }, a),
  salvarImovel: (e, id, d, a) => salvarImovel(e, id, d, a),
  marcarMatriculaMae: (e, id, d, a) => marcarMatriculaMae(e, id, d.matriculaMae, a),
  salvarConferenciaFinal: (e, id, d, a) => salvarConferenciaFinal(e, id, d, a),
  enviarAnaliseFinanceira: (e, id, _d, a) => enviarAnaliseFinanceira(e, id, a),
  aprovarAnaliseFinanceira: (e, id, _d, a) => aprovarAnaliseFinanceira(e, id, a),
  devolverAnaliseFinanceira: (e, id, d, a) => devolverAnaliseFinanceira(e, id, d.motivo, a),
  // SÓ mock: telefone, e-mail e a marca «tem PDF» do formulário de abertura. No servidor o contato
  // entra por `salvarPessoa` e o PDF sobe como documento; esta ação não existe lá.
  completarProcesso: (e, id, d) => completarProcesso(e, id, d),
}

const LOCACAO: Record<string, Fn> = {
  salvarAberturaLocacao: (e, id, d, a) => loc.salvarAberturaLocacao(e, id, d, a),
  enviarAnaliseFinanceira: (e, id, _d, a) => loc.enviarAnaliseFinanceiraLocacao(e, id, a),
  aprovarAnaliseFinanceira: (e, id, _d, a) => loc.aprovarAnaliseFinanceiraLocacao(e, id, a),
  devolverAnaliseFinanceira: (e, id, d, a) => loc.devolverAnaliseFinanceiraLocacao(e, id, d.motivo, a),
  salvarGarantia: (e, id, d, a) => loc.salvarGarantia(e, id, d, a),
  salvarVistoria: (e, id, d, a) => loc.salvarVistoria(e, id, d.quando, d.vistoria, a),
  salvarContrato: (e, id, d, a) => loc.salvarContrato(e, id, d, a),
  gerarCobranca: (e, id, d, a) => loc.gerarCobranca(e, id, d.competencia, a),
  registrarPagamento: (e, id, d, a) => loc.registrarPagamento(e, id, d.cobrancaId, { valor: d.valor, data: d.data, forma: d.forma, comprovante: d.comprovante }, a),
  registrarRepasse: (e, id, d, a) => loc.registrarRepasse(e, id, d.cobrancaId, { valor: d.valor, data: d.data, forma: d.forma, comprovante: d.comprovante }, a),
  anexarComprovante: (e, id, d, a) => loc.anexarComprovante(e, id, d.cobrancaId, d, a),
  concluirEtapaLocacao: (e, id, d, a) => loc.concluirEtapaLocacao(e, id, d.etapa, a),
  renovarLocacao: (e, id, _d, a) => loc.renovarLocacao(e, id, a),
  encerrarLocacao: (e, id, _d, a) => loc.encerrarLocacao(e, id, a),
  arquivarLocacao: (e, id, _d, a) => loc.arquivarLocacao(e, id, a),
  restaurarLocacao: (e, id, _d, a) => loc.restaurarLocacao(e, id, a),
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * O que o store fazia sozinho antes do backend: o domínio puro sobre dados guardados no
 * localStorage (`ArmazemGestao`). Comportamento idêntico ao anterior — esta classe só tirou a
 * lógica do store para que `HttpGestaoRepository` ocupe o mesmo lugar.
 *
 * Se o mock do `mocker-nuxt` não responde, cai nos mesmos dados direto do domínio: o painel não
 * pode amanhecer em branco numa reunião por causa de uma variável de ambiente. O custo é que a
 * falta do mock fica silenciosa — por isso o aviso no console.
 */
export class MockGestaoRepository implements GestaoRepository {
  constructor(
    private readonly armazem: ArmazemGestao,
    private readonly ator: () => Ator,
    /** GETs do mock (`/api/gestao/processos`…). Pode lançar: aí vale o seed local. */
    private readonly buscarSemente: () => Promise<Pick<DadosGestao, 'processos' | 'documentos' | 'locacoes' | 'matriz'>>,
    private readonly agora: () => string = () => agoraDominio(),
  ) {}

  async carregar(): Promise<DadosGestao> {
    const guardado = this.armazem.lerPersistido()
    if (guardado) {
      this.armazem.gravar(guardado)
      return guardado
    }
    let base: Pick<DadosGestao, 'processos' | 'documentos' | 'locacoes' | 'matriz'>
    try {
      base = await this.buscarSemente()
    } catch {
      console.warn('[gestao] mock indisponível (suba com `pnpm dev:gestao`); usando o seed local.')
      base = { processos: processosSeed(), documentos: documentosSeedCompleto(), locacoes: locacoesSeed(), matriz: matrizPadrao() }
    }
    const dados: DadosGestao = { ...base, config: configuracoesPadrao(), consultas: [], corretores: CORRETORES }
    this.armazem.gravar(dados)
    return dados
  }

  /** Volta ao seed: o store apaga o guardado e chama `carregar` de novo. */
  restaurar(): void {
    this.armazem.limparPersistido()
  }

  private estado(d: DadosGestao): Estado {
    // `config` ausente (dado antigo do localStorage): o domínio usa multa e juros padrão.
    return { processos: d.processos, documentos: d.documentos, locacoes: d.locacoes, ...(d.config && { encargos: encargosDaConfig(d.config) }) }
  }

  private guardar<T extends object>(d: DadosGestao, r: Extract<ResultadoDominio, { ok: true }>, id: string, extra?: T): Resultado<Mudanca> {
    const novo: DadosGestao = { ...d, ...r.estado }
    if (!this.armazem.gravar(novo)) return { ok: false, erro: SEM_ESPACO }
    return {
      ok: true,
      processo: novo.processos.find((p) => p.id === id),
      locacao: novo.locacoes.find((l) => l.id === id),
      ...extra,
    }
  }

  async abrirVenda(dados: NovoProcesso): Promise<Resultado<Mudanca>> {
    const d = this.armazem.ler()
    const r = acoes.abrirProcesso(this.estado(d), dados, this.ator(), this.agora())
    if (!r.ok) return r
    return this.guardar(d, r, r.estado.processos[0]!.id)
  }

  async abrirLocacao(dados: NovaLocacao): Promise<Resultado<Mudanca>> {
    const d = this.armazem.ler()
    const r = loc.abrirLocacao(this.estado(d), dados, this.ator(), this.agora())
    if (!r.ok) return r
    return this.guardar(d, r, r.estado.locacoes[0]!.id)
  }

  async executar(tipo: TipoAlvo, id: string, acao: string, dados: unknown = {}): Promise<Resultado<Mudanca>> {
    const fn = (tipo === 'venda' ? VENDA : LOCACAO)[acao]
    if (!fn || !Object.hasOwn(tipo === 'venda' ? VENDA : LOCACAO, acao)) return { ok: false, erro: 'Ação desconhecida.' }
    const d = this.armazem.ler()
    const r = fn(this.estado(d), id, dados, this.ator())
    return r.ok ? this.guardar(d, r, id) : r
  }

  async recarregar(tipo: TipoAlvo, id: string): Promise<Resultado<Mudanca>> {
    const d = this.armazem.ler()
    return { ok: true, ...(tipo === 'venda' ? { processo: d.processos.find((p) => p.id === id) } : { locacao: d.locacoes.find((l) => l.id === id) }) }
  }

  async documentosDoAlvo(_tipo: TipoAlvo, id: string): Promise<Documento[]> {
    return this.armazem.ler().documentos.filter((x) => x.processoId === id && !x.apagado)
  }

  async lixeira(): Promise<Documento[]> {
    return this.armazem.ler().documentos.filter((x) => x.apagado)
  }

  async enviarDocumento(alvo: { tipo: TipoAlvo; id: string }, arquivo: ArquivoGestao, extra: { categoria: CategoriaDocumento; requisito?: string }): Promise<Resultado<Mudanca>> {
    const d = this.armazem.ler()
    const entrada = { nome: arquivo.name, categoria: extra.categoria, processoId: alvo.id, tamanho: arquivo.size, requisito: extra.requisito }
    const r = (alvo.tipo === 'venda' ? acoes.enviarDocumento : loc.enviarDocumentoLocacao)(this.estado(d), entrada, this.ator(), this.agora())
    return r.ok ? this.guardar(d, r, alvo.id, { documento: r.estado.documentos[0] }) : r
  }

  private sobreDocumento(doc: Documento, fn: (e: Estado) => ResultadoDominio): Resultado<Mudanca> {
    const d = this.armazem.ler()
    const r = fn(this.estado(d))
    return r.ok ? this.guardar(d, r, doc.processoId, { documento: r.estado.documentos.find((x) => x.id === doc.id) }) : r
  }

  async novaVersaoDocumento(doc: Documento, _tipo: TipoAlvo, arquivo: ArquivoGestao) {
    return this.sobreDocumento(doc, (e) => acoes.substituirDocumento(e, doc.id, arquivo.size))
  }
  async conferirDocumento(doc: Documento) {
    return this.sobreDocumento(doc, (e) => acoes.conferirDocumento(e, doc.id))
  }
  async apagarDocumento(doc: Documento) {
    return this.sobreDocumento(doc, (e) => acoes.apagarDocumento(e, doc.id, this.ator(), this.agora()))
  }
  async restaurarDocumento(doc: Documento) {
    return this.sobreDocumento(doc, (e) => acoes.restaurarDocumento(e, doc.id))
  }

  async baixarDocumento(): Promise<Resultado<{ url: string | null }>> {
    return { ok: true, url: null }
  }

  private gravarParte(parte: Partial<DadosGestao>): boolean {
    return this.armazem.gravar({ ...this.armazem.ler(), ...parte })
  }

  async salvarMatriz(matriz: MatrizPermissoes): Promise<Resultado<{ matriz: MatrizPermissoes }>> {
    return this.gravarParte({ matriz }) ? { ok: true, matriz } : { ok: false, erro: SEM_ESPACO }
  }

  async salvarConfig(config: ConfiguracoesGestao): Promise<Resultado<{ config: ConfiguracoesGestao }>> {
    return this.gravarParte({ config }) ? { ok: true, config } : { ok: false, erro: SEM_ESPACO }
  }

  async consultar(entrada: EntradaConsulta): Promise<Resultado<{ consulta: ConsultaFeita }>> {
    const d = this.armazem.ler()
    const r = realizarConsulta(entrada, this.ator(), this.agora(), proximoIdConsulta(d.consultas))
    if (!r.ok) return r
    return this.gravarParte({ consultas: [r.consulta, ...d.consultas] }) ? { ok: true, consulta: r.consulta } : { ok: false, erro: SEM_ESPACO }
  }
}
