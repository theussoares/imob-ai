import type { Database } from '~~/shared/types/database.types'
import type { Lead, LeadStage } from '~~/shared/models/lead'
import { toLeadSource, toLeadType } from '~~/shared/models/lead'

type LeadRow = Database['public']['Tables']['leads']['Row']

/** Imóvel embutido na query de leads (só o necessário pra identificar). */
export type LeadPropertyFields = { code: string; title: string } | null

export function toLeadModel(row: LeadRow, property: LeadPropertyFields = null): Lead {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    propertyId: row.property_id,
    name: row.name,
    phone: row.phone,
    message: row.message,
    // source e lead_type são text no banco (com CHECK), mas a normalização aqui
    // protege o painel de linha antiga ou gravada antes do CHECK existir.
    source: toLeadSource(row.source),
    leadType: toLeadType(row.lead_type),
    // stage é text no banco, mas o CHECK garante o conjunto do enum de domínio.
    stage: row.stage as LeadStage,
    notes: row.notes,
    nextContactAt: row.next_contact_at,
    brokerId: row.broker_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    property: property ? { code: property.code, title: property.title } : null,
  }
}
