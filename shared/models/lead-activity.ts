import type { LeadLostReason, LeadStage } from '~~/shared/models/lead'

/**
 * Linha do tempo e agenda do lead (migration 0049).
 * Ver docs/superpowers/specs/2026-09-25-crm-e-cobranca-design.md, seção 3.
 */

/** O que o corretor registra à mão. */
export type LeadManualEventKind = 'nota' | 'ligacao' | 'whatsapp' | 'email' | 'visita'

/**
 * O que só o servidor grava, no mesmo endpoint que muda o estado. Fica fora do
 * que o painel pode postar: um "mudou de etapa" escrito à mão seria histórico
 * inventado — e o histórico vale como prova de atendimento.
 */
export type LeadSystemEventKind = 'etapa' | 'atribuicao' | 'tarefa'

export type LeadEventKind = LeadManualEventKind | LeadSystemEventKind

export const LEAD_MANUAL_EVENT_KINDS: LeadManualEventKind[] = ['nota', 'ligacao', 'whatsapp', 'email', 'visita']

export const LEAD_EVENT_LABELS: Record<LeadEventKind, string> = {
  nota: 'Anotação',
  ligacao: 'Ligação',
  whatsapp: 'WhatsApp',
  email: 'E-mail',
  visita: 'Visita',
  etapa: 'Mudança de etapa',
  atribuicao: 'Responsável',
  tarefa: 'Tarefa concluída',
}

export interface LeadEventMeta {
  from?: LeadStage
  to?: LeadStage
  lostReason?: LeadLostReason
  brokerId?: string | null
  /** 'roleta' quando o servidor escolheu; ausente quando foi alguém no painel. */
  via?: 'roleta'
  taskId?: string
}

export interface LeadEvent {
  id: string
  leadId: string
  kind: LeadEventKind
  body: string | null
  meta: LeadEventMeta
  occurredAt: string
  createdAt: string
  createdBy: string | null
}

/** Registro manual de atendimento pelo painel. */
export interface LeadEventInput {
  kind: LeadManualEventKind
  body: string
  /** Quando aconteceu (ligação de ontem anotada hoje). Padrão: agora. */
  occurredAt?: string | null
}

/** Evento a gravar, antes de ter id — o que `eventosDaMudanca` produz. */
export interface NewLeadEvent {
  kind: LeadEventKind
  body: string | null
  meta: LeadEventMeta
}

/**
 * Eventos de sistema que uma edição do lead gera, comparando antes e depois.
 *
 * Função pura, e não trigger no banco, porque o texto precisa do NOME do
 * corretor (quem lê o histórico daqui a um ano não reconhece um uuid, e o
 * corretor pode ter sido excluído até lá) e porque o trigger não saberia se a
 * mudança veio da roleta ou de uma pessoa.
 */
export function eventosDaMudanca(
  antes: { stage: LeadStage; brokerId: string | null },
  depois: { stage: LeadStage; brokerId: string | null; lostReason: LeadLostReason | null },
  nomeDoCorretor: (id: string) => string | null,
  labels: { stage: Record<LeadStage, string>; lostReason: Record<LeadLostReason, string> },
): NewLeadEvent[] {
  const out: NewLeadEvent[] = []
  if (antes.stage !== depois.stage) {
    const motivo = depois.stage === 'perdido' && depois.lostReason ? ` (${labels.lostReason[depois.lostReason]})` : ''
    out.push({
      kind: 'etapa',
      body: `${labels.stage[antes.stage]} → ${labels.stage[depois.stage]}${motivo}`,
      meta: {
        from: antes.stage,
        to: depois.stage,
        ...(depois.stage === 'perdido' && depois.lostReason ? { lostReason: depois.lostReason } : {}),
      },
    })
  }
  if (antes.brokerId !== depois.brokerId) {
    out.push({
      kind: 'atribuicao',
      body: depois.brokerId ? `Atribuído a ${nomeDoCorretor(depois.brokerId) ?? 'corretor'}` : 'Sem responsável',
      meta: { brokerId: depois.brokerId },
    })
  }
  return out
}

export type LeadTaskKind = 'visita' | 'retorno' | 'outro'

export const LEAD_TASK_KINDS: LeadTaskKind[] = ['visita', 'retorno', 'outro']

export const LEAD_TASK_LABELS: Record<LeadTaskKind, string> = {
  visita: 'Visita',
  retorno: 'Retorno',
  outro: 'Outro',
}

export interface LeadTask {
  id: string
  leadId: string | null
  propertyId: string | null
  brokerId: string | null
  kind: LeadTaskKind
  title: string
  dueAt: string
  doneAt: string | null
  canceledAt: string | null
  createdAt: string
  /** Para a agenda mostrar de quem é a tarefa sem outra ida ao servidor. */
  lead: { name: string | null; phone: string | null; stage: LeadStage } | null
  property: { code: string; title: string } | null
}

export interface LeadTaskInput {
  leadId?: string | null
  propertyId?: string | null
  brokerId?: string | null
  kind: LeadTaskKind
  title: string
  dueAt: string
}

/** O que se pode mudar numa tarefa: concluir, cancelar, reagendar, trocar o dono. */
export interface LeadTaskUpdateInput {
  done?: boolean
  canceled?: boolean
  dueAt?: string
  title?: string
  brokerId?: string | null
}

export type AgendaBucket = 'atrasadas' | 'hoje' | 'proximas' | 'depois'

/**
 * Em que coluna da agenda a tarefa cai.
 *
 * "Hoje" é o dia de São Paulo, não o do servidor (UTC): às 22h de Brasília já
 * é amanhã em UTC, e a visita das 23h sumiria de "Hoje" justo na noite anterior.
 */
export function agendaBucket(dueAt: string, agora: Date, timeZone = 'America/Sao_Paulo'): AgendaBucket {
  const due = new Date(dueAt)
  // A visita das 9h que às 15h não foi concluída está atrasada, mesmo sendo
  // de hoje: é exatamente a que o corretor precisa ver primeiro.
  if (due.getTime() < agora.getTime()) return 'atrasadas'
  const hoje = diaLocal(agora, timeZone)
  const dia = diaLocal(due, timeZone)
  if (dia === hoje) return 'hoje'
  const seteDias = diaLocal(new Date(agora.getTime() + 7 * 24 * 60 * 60 * 1000), timeZone)
  return dia <= seteDias ? 'proximas' : 'depois'
}

/** 'AAAA-MM-DD' no fuso — comparável como string. */
function diaLocal(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}
