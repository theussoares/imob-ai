import type { Database } from '~~/shared/types/database.types'
import type { Broker, BrokerInput } from '~~/shared/models/broker'

type BrokerRow = Database['public']['Tables']['brokers']['Row']
type BrokerInsert = Database['public']['Tables']['brokers']['Insert']

export function toBrokerModel(row: BrokerRow): Broker {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    creci: row.creci,
    active: row.active,
  }
}

export function toBrokerRow(input: BrokerInput, tenantId: string): BrokerInsert {
  return {
    tenant_id: tenantId,
    name: input.name.trim(),
    phone: input.phone?.trim() || null,
    email: input.email?.trim() || null,
    creci: input.creci?.trim() || null,
    active: input.active ?? true,
  }
}
