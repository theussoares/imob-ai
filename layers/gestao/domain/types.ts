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
  | 'financeiroLivre'
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

/**
 * Análise do financeiro de um contrato (venda ou locação). Quem abre sem a permissão `valores` preenche o
 * financeiro livremente, mas ele só vale depois de passar por quem tem `valores`. Ausente = sem análise (legado,
 * ou aberto por quem já tem `valores`): não bloqueia nada.
 */
export type StatusAnaliseFin = 'rascunho' | 'em-analise' | 'aprovado' | 'devolvido'

export interface AnaliseFinanceira {
  status: StatusAnaliseFin
  enviadoPor?: string
  /** dd/mm/aaaa hh:mm, como o histórico. */
  enviadoEm?: string
  decididoPor?: string
  decididoEm?: string
  /** Motivo da devolução; só em `devolvido`. */
  motivo?: string
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
  /** FGTS e recurso próprio são opcionais (0 = não usa): juntos formam a entrada. */
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
  /** Imóvel do cadastro (`properties.id`). Ausente nas vendas antigas, que tinham o imóvel em texto livre. */
  imovelId?: string
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
  /** Observações do jurídico, da etapa 7. */
  obs: string
  /**
   * Observações do contrato: o que foi combinado entre as partes («metade no dia 10, o resto na
   * escritura»). Separado de `obs` porque aquele é do jurídico, só na etapa 7; este vale o processo
   * todo e aparece na lista. Opcional porque os processos gravados antes dele não o têm.
   */
  anotacoes?: string
  /** contrato PDF anexado (some do aviso «contratos sem PDF») */
  pdf: boolean
  /** Matrícula-mãe: exige projeto/prancha do imóvel (anotação da reunião). */
  matriculaMae?: boolean
  /** Valor venal do imóvel (IPTU), preenchido na etapa 4. */
  valorVenal?: number
  conferenciaFinal?: ConferenciaFinal
  /** Contrato preliminar (opcional): existe ou não e o nome do PDF anexado. */
  preliminar?: { existe: boolean; arquivo: string | null }
  analiseFin?: AnaliseFinanceira
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

// ---- Locação ---------------------------------------------------------------
// Tipo próprio, e não `Processo` com `tipo`: `Processo` está acoplado a comissão e
// fontes de pagamento da venda; misturar quebraria o fluxo que o cliente já aprovou.

export type StatusLocacao =
  | 'Em abertura'
  | 'Aguardando documentação'
  | 'Aguardando garantia'
  | 'Aguardando vistoria de entrada'
  | 'Contrato e aluguel'
  | 'Ativa'
  | 'Encerrada'

export type TipoGarantia = 'Caução' | 'Seguro-fiança' | 'Fiador' | 'Título de capitalização' | 'Outra'

export interface Vistoria {
  /** ISO yyyy-mm-dd */
  data: string
  responsavel: string
  /** nomes dos arquivos de foto */
  fotos: string[]
  observacao: string
}

export interface ContratoLocacao {
  valor: number
  /** 1..28: dia 29 a 31 não existe em todo mês. */
  diaVencimento: number
  /** ISO yyyy-mm-dd */
  inicio: string
  fim: string
  reajuste: 'IGP-M' | 'IPCA' | 'Outro'
  /** taxa da imobiliária sobre o aluguel, 0..100 */
  taxaPct: number
}

export type FormaPagamentoCobranca = 'PIX' | 'Dinheiro' | 'Transferência' | 'Boleto' | 'Outro'

/** Um recebimento da cobrança. Só cresce (nunca editado nem apagado): o histórico do dinheiro. */
export interface Pagamento {
  id: string
  valor: number
  /** ISO yyyy-mm-dd */
  data: string
  forma: FormaPagamentoCobranca
  /** Opcional: o comprovante deixou de ser obrigatório. */
  comprovante?: string | null
}

export interface Repasse {
  /** devido ao locador: aluguel menos a taxa. */
  valor: number
  /** já repassado (soma dos repasses; pode ser parcial). Ausente = 0, ou `valor` se `feito` for legado. */
  repassado?: number
  feito: boolean
  data?: string
  forma?: FormaPagamentoCobranca
  comprovante?: string | null
}

export interface Cobranca {
  id: string
  /** mês de ocupação, AAAA-MM */
  competencia: string
  valor: number
  /** ISO yyyy-mm-dd */
  vencimento: string
  /** Quitada: marcador que avisos e recortes já usavam. `comprovante` pode ser vazio (opcional). */
  pago?: { data: string; comprovante: string }
  /** Recebimentos, inclusive parciais (a cobrança só vira `pago` quando a soma cobre o valor atualizado). */
  pagamentos?: Pagamento[]
  repasse?: Repasse
}

export interface Locacao {
  id: string
  tipo: 'locacao'
  locador: Pessoa
  locatario: Pessoa
  imovelId: string
  imovel: string
  corretorId: string
  status: StatusLocacao
  updated: string
  /** etapa em que a locação está, 1..8 */
  etapa: number
  concluidas: boolean[]
  garantia?: { tipo: TipoGarantia; detalhe: string }
  vistoriaEntrada?: Vistoria
  vistoriaSaida?: Vistoria
  contrato?: ContratoLocacao
  cobrancas: Cobranca[]
  hist: EventoHistorico[]
  obs: string
  /** Análise dos dados financeiros do contrato (valor do aluguel e taxa). Cobranças e repasses ficam só com `valores`. */
  analiseFin?: AnaliseFinanceira
  arquivado: boolean
}

// ---- Acesso e auditoria no servidor (backend F1) ------------------------------

export type StatusMembro = 'ativo' | 'pendente' | 'expirado'

/** Linha da tela «Usuários e permissões». `voce` é preenchido por quem lista. */
export interface MembroGestaoLista {
  id: string
  nome: string
  email: string
  perfil: Perfil
  /** Corretor cadastrado (`brokers.id`) quando o perfil é `corretor`. */
  brokerId: string | null
  status: StatusMembro
  convidadoPor: string
  /** ISO; só para convite ainda não aceito. */
  conviteExpiraEm: string | null
  criadoEm: string
  voce?: boolean
}

export type AlvoEvento = 'venda' | 'locacao' | 'documento' | 'imovel' | 'membro' | 'config' | 'consulta'

/** Registro de `gestao_eventos`: só cresce, autor e hora dados pelo servidor. */
export interface EventoGestao {
  id: string
  atorUserId: string
  atorNome: string
  acao: string
  alvoTipo: AlvoEvento
  alvoId: string
  /** ISO */
  quando: string
}
