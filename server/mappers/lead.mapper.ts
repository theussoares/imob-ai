import type { Database } from '~~/shared/types/database.types'
import type { Lead } from '~~/shared/models/lead'

type LeadRow = Database['public']['Tables']['leads']['Row']

export function toLeadModel(row: LeadRow): Lead {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    propertyId: row.property_id,
    name: row.name,
    phone: row.phone,
    message: row.message,
    source: row.source,
    createdAt: row.created_at,
  }
}
