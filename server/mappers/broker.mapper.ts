import type { Database } from '~~/shared/types/database.types'
import type { Broker, BrokerInput, PublicBroker } from '~~/shared/models/broker'

type BrokerRow = Database['public']['Tables']['brokers']['Row']
type BrokerInsert = Database['public']['Tables']['brokers']['Insert']
type PublicBrokerRow = Pick<BrokerRow, 'id' | 'name' | 'photo_url' | 'bio' | 'creci'>

export function toBrokerModel(row: BrokerRow): Broker {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    creci: row.creci,
    active: row.active,
    photoUrl: row.photo_url,
    bio: row.bio,
    publicVisible: row.public_visible,
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
    photo_url: input.photoUrl?.trim() || null,
    bio: input.bio?.trim() || null,
    public_visible: input.publicVisible ?? false,
  }
}

/** Fonte única do recorte público — nunca monta `PublicBroker` a mão em outro lugar. */
export function toPublicBrokerModel(row: PublicBrokerRow): PublicBroker {
  return { id: row.id, name: row.name, photoUrl: row.photo_url, bio: row.bio, creci: row.creci }
}
