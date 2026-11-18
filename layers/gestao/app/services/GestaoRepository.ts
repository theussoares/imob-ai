import type { NovoProcesso } from '../../domain/acoes'
import type { NovaLocacao } from '../../domain/acoes-locacao'
import type { ConfiguracoesGestao } from '../../domain/configuracoes'
import type { ConsultaFeita, EntradaConsulta } from '../../domain/consulta'
import type { CategoriaDocumento, Corretor, Documento, Locacao, MatrizPermissoes, Processo } from '../../domain/types'
import type { Falha } from './clienteGestao'

export type { Falha } from './clienteGestao'

export type Resultado<T extends object = object> = ({ ok: true } & T) | Falha

export type TipoAlvo = 'venda' | 'locacao'

/**
 * Fatias do carregamento em `http`. Cada tela pede só as que usa: abrir o painel disparava 9 requisições
 * (matriz, vendas, locações e seus arquivados, corretores, configurações, consultas, imóveis) mesmo
 * quando a aba precisava de uma. `mock` ignora: lê tudo do armazém local, sem custo de rede.
 */
export type EscopoCarga = 'base' | 'corretores' | 'vendas' | 'locacoes' | 'imoveis' | 'config' | 'consultas'
export const ESCOPOS_TODOS: readonly EscopoCarga[] = ['base', 'corretores', 'vendas', 'locacoes', 'imoveis', 'config', 'consultas']

/** Tudo que a tela lê. Em `http`, `documentos` vem vazio: carrega por processo (`documentosDoAlvo`). */
export interface DadosGestao {
  processos: Processo[]
  locacoes: Locacao[]
  documentos: Documento[]
  matriz: MatrizPermissoes
  config: ConfiguracoesGestao
  consultas: ConsultaFeita[]
  corretores: Corretor[]
}

/** O que uma ação mudou. O store troca só estes agregados; nada de recarregar a lista. */
export interface Mudanca {
  processo?: Processo
  locacao?: Locacao
  documento?: Documento
}

/** Arquivo escolhido. Em `mock` basta nome e tamanho (o demo não guarda binário); em `http` o `file` sobe de verdade. */
export interface ArquivoGestao {
  name: string
  size: number
  file?: File
}

/**
 * Contrato dos dados do /gestao (vendas, locações, documentos, matriz, configurações, consulta).
 * `MockGestaoRepository` roda o domínio puro sobre o localStorage; `HttpGestaoRepository` fala com
 * `/api/gestao/**`. Permissão NÃO mora aqui: o store checa antes, e o servidor repete.
 *
 * `executar` recebe o NOME da ação (a mesma chave que o servidor despacha) e `dados`; ator e data
 * são da implementação (mock: sessão; http: servidor).
 */
export interface GestaoRepository {
  carregar(): Promise<DadosGestao>
  abrirVenda(dados: NovoProcesso): Promise<Resultado<Mudanca>>
  abrirLocacao(dados: NovaLocacao): Promise<Resultado<Mudanca>>
  executar(tipo: TipoAlvo, id: string, acao: string, dados?: unknown): Promise<Resultado<Mudanca>>
  /** Relê um agregado (depois de um 409). */
  recarregar(tipo: TipoAlvo, id: string): Promise<Resultado<Mudanca>>

  documentosDoAlvo(tipo: TipoAlvo, id: string): Promise<Documento[]>
  lixeira(): Promise<Documento[]>
  enviarDocumento(alvo: { tipo: TipoAlvo; id: string }, arquivo: ArquivoGestao, extra: { categoria: CategoriaDocumento; requisito?: string }): Promise<Resultado<Mudanca>>
  novaVersaoDocumento(doc: Documento, tipo: TipoAlvo, arquivo: ArquivoGestao): Promise<Resultado<Mudanca>>
  conferirDocumento(doc: Documento): Promise<Resultado<Mudanca>>
  apagarDocumento(doc: Documento): Promise<Resultado<Mudanca>>
  restaurarDocumento(doc: Documento): Promise<Resultado<Mudanca>>
  /** `http`: URL assinada de 60 s. `mock`: sem URL (o demo não tem arquivo). */
  baixarDocumento(doc: Documento): Promise<Resultado<{ url: string | null }>>

  salvarMatriz(matriz: MatrizPermissoes): Promise<Resultado<{ matriz: MatrizPermissoes }>>
  salvarConfig(config: ConfiguracoesGestao): Promise<Resultado<{ config: ConfiguracoesGestao }>>
  consultar(entrada: EntradaConsulta): Promise<Resultado<{ consulta: ConsultaFeita }>>
}

/** Onde o mock guarda os dados. `gravar` devolve `false` quando não coube (localStorage cheio). */
export interface ArmazemGestao {
  ler(): DadosGestao
  gravar(dados: DadosGestao): boolean
  /** Dados do localStorage, ou `null` se não há (ou estão corrompidos). */
  lerPersistido(): DadosGestao | null
  limparPersistido(): void
}
