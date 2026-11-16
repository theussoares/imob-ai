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
  | 'convidar'
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
  telefone?: string
  email?: string
}

export type GanhoCapital = 'Isento' | 'Há ganho de capital' | 'Ainda não analisado'

export type FormaPagamento = 'À vista' | 'Financiamento' | 'Misto'

export interface FontesPagamento {
  forma: FormaPagamento
  financiado: number
  entrada: number
  fgts: number
  proprios: number
  /** Valor de avaliação do imóvel (checklist da Olmi). */
  avaliacao?: number
  /** Ganho de capital do vendedor (imposto a recolher por ele). Ausente = ainda não analisado. */
  ganho?: GanhoCapital
  /** Bem dado na entrada (casa, carro…): descrição e valor abatido. */
  bem?: string
  valorBem?: number
}

export type ResponsavelAdiantamento = 'vendedor' | 'captador' | 'imob'

export interface Adiantamento {
  id: string
  resp: ResponsavelAdiantamento
  valor: number
  /** ISO yyyy-mm-dd */
  data: string
  quem: string
  /** «adiantamento» (durante a venda) ou «fim-contrato» (acerto na conclusão). Ausente = adiantamento. */
  momento?: 'adiantamento' | 'fim-contrato'
  /** Checkbox de pagamento: só vale como pago com comprovante anexado. */
  pago?: boolean
  /** Nome do arquivo do comprovante. */
  comprovante?: string | null
}

/** Conferência final do checklist da Olmi: quatro caixas, responsável e data. */
export interface ConferenciaFinal {
  documentacao: boolean
  valores: boolean
  comissao: boolean
  encaminhado: boolean
  responsavel: string
  /** ISO yyyy-mm-dd */
  data: string
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
  /** Matrícula-mãe: exige projeto/prancha do imóvel (anotação da reunião). */
  matriculaMae?: boolean
  /** Valor venal do imóvel (IPTU), preenchido na etapa 4. */
  valorVenal?: number
  conferenciaFinal?: ConferenciaFinal
  /** Contrato preliminar (opcional): existe ou não e o nome do PDF anexado. */
  preliminar?: { existe: boolean; arquivo: string | null }
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
  /**
   * Chave do item de checklist que este arquivo atende (ver `requisitos.ts`).
   * Ausente = documento avulso, enviado pela tela de documentos.
   */
  requisito?: string
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
