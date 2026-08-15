import type { Database } from '~~/shared/types/database.types'
import type { Lead } from '~~/shared/models/lead'

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
    source: row.source,
    createdAt: row.created_at,
    property: property ? { code: property.code, title: property.title } : null,
  }
}
