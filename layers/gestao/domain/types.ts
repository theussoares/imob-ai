/**
 * Modelos do painel de gestão. Fonte única: telas, mocks e (depois) servidor
 * importam daqui. Nomes de domínio em português, como no protótipo.
 */

export type Perfil = 'corretor' | 'recepcao' | 'juridico' | 'dono'

export type PermValor = 'sim' | 'proprio' | 'nao'

export type PermChave =
  | 'verTodos'
  | 'criar'
  | 'editar'
  | 'enviarDocs'
  | 'conferir'
  | 'apagarDocs'
  | 'juridico'
  | 'arquivar'
  | 'valores'
  | 'consulta'
  | 'auditoria'
  | 'admin'

export type MatrizPermissoes = Record<PermChave, Record<Perfil, PermValor>>

export interface Sessao {
  perfil: Perfil
  nome: string
  /** id do corretor quando o perfil é `corretor`; é o que filtra "só os meus". */
  corretorId: string | null
}

export interface Pessoa {
  nome: string
  cpf: string
}

export type FormaPagamento = 'À vista' | 'Financiamento' | 'Misto'

export interface FontesPagamento {
  forma: FormaPagamento
  financiado: number
  entrada: number
  fgts: number
  proprios: number
}

export type ResponsavelAdiantamento = 'vendedor' | 'captador' | 'imob'

export interface Adiantamento {
  id: string
  resp: ResponsavelAdiantamento
  valor: number
  /** ISO yyyy-mm-dd */
  data: string
  quem: string
}

export interface EventoHistorico {
  acao: string
  quem: string
  /** dd/mm/aaaa hh:mm — texto de exibição, como no protótipo. */
  quando: string
}

export interface Processo {
  id: string
  tipo: 'venda'
  vendedor: Pessoa
  comprador: Pessoa
  imovel: string
  corretorId: string
  captadorId: string
  status: StatusVenda
  updated: string
  valor: number
  /** % de comissão sobre o valor */
  pct: number
  fin: FontesPagamento
  /** etapa em que o processo está, 1..8 */
  etapa: number
  /** uma posição por etapa; true = concluída */
  concluidas: boolean[]
  adiantamentos: Adiantamento[]
  hist: EventoHistorico[]
  obs: string
  /** contrato PDF anexado (some do aviso «contratos sem PDF») */
  pdf: boolean
  arquivado: boolean
}

export type StatusVenda =
  | 'Em negociação'
  | 'Proposta realizada'
  | 'Proposta aprovada'
  | 'Aguardando documentação'
  | 'Documentação completa'
  | 'Em análise de financiamento'
  | 'Financiamento aprovado'
  | 'Contrato em elaboração'
  | 'Aguardando assinatura'
  | 'Contrato assinado'
  | 'Aguardando registro'
  | 'Venda concluída'
  | 'Venda cancelada'

export type TomStatus = 'neutral' | 'blue' | 'amber' | 'green' | 'purple' | 'red'

export type CategoriaDocumento = 'pessoas' | 'imoveis' | 'venda' | 'locacao' | 'vistoria' | 'financeiro'

export type EstadoDocumento = 'pendente' | 'enviado' | 'conferido'

export interface Documento {
  id: string
  nome: string
  categoria: CategoriaDocumento
  processoId: string
  estado: EstadoDocumento
  /** bytes */
  tamanho: number
  versoes: number
  enviadoPor: string
  /** preenchido quando foi para a lixeira */
  apagado: { quem: string; quando: string } | null
}

export interface Corretor {
  id: string
  nome: string
}

export interface UsuarioGestao {
  nome: string
  mail: string
  perfil: Perfil
}
