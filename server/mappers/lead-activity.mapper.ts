import type { Database } from '~~/shared/types/database.types'
import type { LeadStage } from '~~/shared/models/lead'
import type { LeadEvent, LeadEventKind, LeadEventMeta, LeadTask, LeadTaskKind } from '~~/shared/models/lead-activity'

type EventRow = Database['public']['Tables']['lead_events']['Row']
type TaskRow = Database['public']['Tables']['lead_tasks']['Row']

export type TaskEmbeds = {
  leads?: { name: string | null; phone: string | null; stage: string } | null
  properties?: { code: string; title: string } | null
}

export function toLeadEventModel(row: EventRow): LeadEvent {
  return {
    id: row.id,
    leadId: row.lead_id,
    // `kind` tem CHECK no banco (0049).
    kind: row.kind as LeadEventKind,
    body: row.body,
    // jsonb chega como `Json`; o formato é o que o servidor gravou, e só ele grava.
    meta: (row.meta && typeof row.meta === 'object' && !Array.isArray(row.meta) ? row.meta : {}) as LeadEventMeta,
    occurredAt: row.occurred_at,
    createdAt: row.created_at,
    createdBy: row.created_by,
  }
}

export function toLeadTaskModel(row: TaskRow & TaskEmbeds): LeadTask {
  return {
    id: row.id,
    leadId: row.lead_id,
    propertyId: row.property_id,
    brokerId: row.broker_id,
    kind: row.kind as LeadTaskKind,
    title: row.title,
    dueAt: row.due_at,
    doneAt: row.done_at,
    canceledAt: row.canceled_at,
    createdAt: row.created_at,
    lead: row.leads ? { name: row.leads.name, phone: row.leads.phone, stage: row.leads.stage as LeadStage } : null,
    property: row.properties ? { code: row.properties.code, title: row.properties.title } : null,
  }
}
