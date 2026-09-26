import type { PropertyType } from '~~/shared/models/property'

/**
 * Por quanto tempo um lead sem movimento fica guardado antes do expurgo.
 *
 * LGPD, arts. 15 e 16: o tratamento acaba quando a finalidade se esgota, e
 * "responder a este pedido" se esgota bem antes de dois anos sem contato. 24 e
 * não 12 porque imóvel tem ciclo longo: quem pergunta hoje pode comprar daqui a
 * um ano. Decisão registrada em docs/runbooks/lgpd-site-publico.md (Q2).
 *
 * É a MESMA constante que a política de privacidade mostra ao visitante — o
 * número prometido e o número aplicado não têm como divergir.
 */
export const LEAD_RETENCAO_MESES = 24

/** Data antes da qual um lead parado entra no expurgo. */
export function corteDeRetencaoDeLeads(agora: Date): Date {
  const d = new Date(agora)
  d.setUTCMonth(d.getUTCMonth() - LEAD_RETENCAO_MESES)
  return d
}

/** Etapas do funil de atendimento de um lead. */
export type LeadStage = 'novo' | 'contato' | 'visita' | 'proposta' | 'fechado' | 'perdido'

/** Ordem e rótulos do funil. 'perdido' fica fora do quadro (é arquivo). */
export const LEAD_STAGES: LeadStage[] = ['novo', 'contato', 'visita', 'proposta', 'fechado']

/**
 * Todos os valores aceitos em `stage` — inclui 'perdido', que é arquivo e não
 * vira coluna. Existe separado de `LEAD_STAGES` porque validação e quadro são
 * perguntas diferentes; o validador do servidor mantinha uma cópia própria desta
 * lista, que é exatamente o tipo de duplicata que sai do lugar com o tempo.
 */
export const ALL_LEAD_STAGES: LeadStage[] = [...LEAD_STAGES, 'perdido']

export const LEAD_STAGE_LABELS: Record<LeadStage, string> = {
  novo: 'Novo',
  contato: 'Em contato',
  visita: 'Visita',
  proposta: 'Proposta',
  fechado: 'Fechado',
  perdido: 'Perdido',
}

/**
 * O que a pessoa quer. Separa o LADO (procura imóvel / oferece imóvel) do tipo
 * de transação, porque os dois eixos existem de verdade e mudam o atendimento:
 * `busca_*` recebe opções, `oferta_*` recebe visita de avaliação.
 *
 * Um enum sem `busca_aluguel` jogaria o inquilino em `busca_compra` (falso) ou
 * em `indefinido` (desistir do dado) — e um valor único de "locação" não diria
 * de que lado do balcão a pessoa está, que é justamente o que o corretor
 * precisa saber antes de ligar.
 */
export type LeadType = 'busca_compra' | 'busca_aluguel' | 'oferta_venda' | 'oferta_aluguel' | 'indefinido'

export const LEAD_TYPES: LeadType[] = ['busca_compra', 'busca_aluguel', 'oferta_venda', 'oferta_aluguel', 'indefinido']

export const LEAD_TYPE_LABELS: Record<LeadType, string> = {
  busca_compra: 'Quer comprar',
  busca_aluguel: 'Quer alugar',
  oferta_venda: 'Quer vender',
  oferta_aluguel: 'Quer alugar (proprietário)',
  indefinido: 'Indefinido',
}

/**
 * Origem do lead — por onde ele entrou.
 *
 * É lista fechada porque vira métrica de aquisição mostrada ao cliente ("de onde
 * vêm meus contatos?"), e o endpoint que grava é público: valor livre vindo do
 * body significaria gráfico envenenado por qualquer um.
 */
export type LeadSource = 'property_page' | 'catalog_empty' | 'catalog_footer' | 'quero_vender' | 'manual' | 'outro'

export const LEAD_SOURCES: LeadSource[] = [
  'property_page',
  'catalog_empty',
  'catalog_footer',
  'quero_vender',
  'manual',
  'outro',
]

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  property_page: 'Página de imóvel',
  catalog_empty: 'Busca sem resultado',
  catalog_footer: 'Fim do catálogo',
  quero_vender: 'Quero vender',
  manual: 'Cadastro manual',
  outro: 'Outro',
}

/**
 * Normaliza valor vindo de fora (body público ou linha antiga do banco).
 *
 * Cai no neutro em vez de lançar erro de propósito: classificar o lead não é
 * controle de acesso — derrubar o formulário do visitante porque o campo veio
 * estranho perderia o contato, que é o que realmente importa.
 */
export function toLeadType(value: unknown): LeadType {
  return LEAD_TYPES.includes(value as LeadType) ? (value as LeadType) : 'indefinido'
}

/** Mesma ideia de `toLeadType`, para a origem. */
export function toLeadSource(value: unknown): LeadSource {
  return LEAD_SOURCES.includes(value as LeadSource) ? (value as LeadSource) : 'outro'
}

/** Tipo de lead de quem PROCURA um imóvel com este objetivo. */
export function seekingTypeFor(purpose: 'venda' | 'aluguel' | null | undefined): LeadType {
  if (purpose === 'venda') return 'busca_compra'
  if (purpose === 'aluguel') return 'busca_aluguel'
  return 'indefinido'
}

/** Contato/lead capturado pelo formulário público ou cadastrado à mão no painel. */
export interface Lead {
  id: string
  tenantId: string
  propertyId: string | null
  name: string | null
  phone: string | null
  message: string | null
  source: LeadSource
  /** O que a pessoa quer (procurar/ofertar, comprar/alugar). */
  leadType: LeadType
  stage: LeadStage
  /** Anotações do corretor (histórico do atendimento). */
  notes: string | null
  /** Data do próximo retorno combinado — alimenta o alerta de follow-up. */
  nextContactAt: string | null
  /** Corretor responsável pelo atendimento (opcional). */
  brokerId: string | null
  /** Motivo de perda; preenchido quando `stage` é 'perdido' (leads antigos podem não ter). */
  lostReason: LeadLostReason | null
  createdAt: string
  updatedAt: string
  /** Quem alterou por último. Null em contato nunca editado no painel. */
  updatedBy: string | null
  /** Imóvel de origem do contato (null quando veio da home ou foi excluído). */
  property?: {
    code: string
    title: string
    type: PropertyType
    bedrooms: number
    neighborhood: string | null
  } | null
}

/** Payload do formulário público. */
export interface LeadInput {
  name: string
  phone: string
  message?: string | null
  propertyCode?: string | null
  source?: string
  leadType?: string
}

/** Cadastro manual de um contato pelo painel (lead que chegou por outro canal). */
export interface LeadCreateInput {
  name: string
  phone?: string | null
  message?: string | null
  stage?: LeadStage
  leadType?: LeadType
  notes?: string | null
  nextContactAt?: string | null
  brokerId?: string | null
  source?: string
  /**
   * Clique no WhatsApp de onde este contato saiu. O servidor lê o imóvel do
   * clique e marca a conversão — ver `server/api/admin/leads.post.ts`.
   */
  whatsappClickId?: string | null
}

/**
 * Edição de um lead no painel (mover no funil, trocar o responsável).
 *
 * `notes` e `nextContactAt` existem só para a imobiliária SEM o CRM (0054),
 * cuja ficha é a de antes da 0049. Com o CRM o servidor os recusa: anotação é
 * evento da linha do tempo (append-only) e retorno é tarefa, e aceitar os dois
 * deixaria um caminho que sobrescreve o histórico.
 */
export interface LeadUpdateInput {
  name?: string | null
  phone?: string | null
  stage?: LeadStage
  leadType?: LeadType
  brokerId?: string | null
  /** Obrigatório quando `stage` vira 'perdido' (com o CRM). */
  lostReason?: LeadLostReason | null
  /** Só sem o CRM. */
  notes?: string | null
  /** Só sem o CRM: vira a tarefa de retorno (`reagendarRetorno`). */
  nextContactAt?: string | null
}

/**
 * Por que o lead foi perdido. Obrigatório ao mover para 'perdido' — é o
 * relatório que o dono da imobiliária pede ("por que estamos perdendo?"), e
 * um campo opcional ficaria vazio em quase todo lead.
 */
export type LeadLostReason =
  | 'preco'
  | 'fechou_com_outro'
  | 'sem_resposta'
  | 'credito_negado'
  | 'desistiu'
  | 'imovel_indisponivel'
  | 'outro'

export const LEAD_LOST_REASONS: LeadLostReason[] = [
  'preco',
  'fechou_com_outro',
  'sem_resposta',
  'credito_negado',
  'desistiu',
  'imovel_indisponivel',
  'outro',
]

export const LEAD_LOST_REASON_LABELS: Record<LeadLostReason, string> = {
  preco: 'Preço',
  fechou_com_outro: 'Fechou com outra imobiliária',
  sem_resposta: 'Parou de responder',
  credito_negado: 'Crédito/financiamento negado',
  desistiu: 'Desistiu',
  imovel_indisponivel: 'Imóvel indisponível',
  outro: 'Outro',
}

export function toLeadLostReason(value: unknown): LeadLostReason | null {
  return LEAD_LOST_REASONS.includes(value as LeadLostReason) ? (value as LeadLostReason) : null
}
