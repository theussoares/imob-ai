import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~~/shared/types/database.types'

type Client = SupabaseClient<Database>

export interface CreateLeadArgs {
  tenantId: string
  propertyId: string | null
  name: string
  phone: string
  message: string | null
  source: string
}

export async function createLead(client: Client, args: CreateLeadArgs): Promise<void> {
  const { error } = await client.from('leads').insert({
    tenant_id: args.tenantId,
    property_id: args.propertyId,
    name: args.name,
    phone: args.phone,
    message: args.message,
    source: args.source,
  })
  if (error) throw error
}
