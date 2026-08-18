/** Etapas do funil de atendimento de um lead. */
export type LeadStage = 'novo' | 'contato' | 'visita' | 'proposta' | 'fechado' | 'perdido'

/** Ordem e rótulos do funil. 'perdido' fica fora do quadro (é arquivo). */
export const LEAD_STAGES: LeadStage[] = ['novo', 'contato', 'visita', 'proposta', 'fechado']

export const LEAD_STAGE_LABELS: Record<LeadStage, string> = {
  novo: 'Novo',
  contato: 'Em contato',
  visita: 'Visita',
  proposta: 'Proposta',
  fechado: 'Fechado',
  perdido: 'Perdido',
}

/** Contato/lead capturado pelo formulário público ou cadastrado à mão no painel. */
export interface Lead {
  id: string
  tenantId: string
  propertyId: string | null
  name: string | null
  phone: string | null
  message: string | null
  source: string
  stage: LeadStage
  /** Anotações do corretor (histórico do atendimento). */
  notes: string | null
  /** Data do próximo retorno combinado — alimenta o alerta de follow-up. */
  nextContactAt: string | null
  /** Corretor responsável pelo atendimento (opcional). */
  brokerId: string | null
  createdAt: string
  updatedAt: string
  /** Imóvel de origem do contato (null quando veio da home ou foi excluído). */
  property?: { code: string; title: string } | null
}

/** Payload do formulário público. */
export interface LeadInput {
  name: string
  phone: string
  message?: string | null
  propertyCode?: string | null
  source?: string
}

/** Cadastro manual de um contato pelo painel (lead que chegou por outro canal). */
export interface LeadCreateInput {
  name: string
  phone?: string | null
  message?: string | null
  stage?: LeadStage
  notes?: string | null
  nextContactAt?: string | null
  brokerId?: string | null
  source?: string
}

/** Edição de um lead no painel (mover no funil, anotar, agendar retorno). */
export interface LeadUpdateInput {
  name?: string | null
  phone?: string | null
  stage?: LeadStage
  notes?: string | null
  nextContactAt?: string | null
  brokerId?: string | null
}
