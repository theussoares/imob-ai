import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~~/shared/types/database.types'
import type { Lead } from '~~/shared/models/lead'
import { toLeadModel } from '~~/server/mappers/lead.mapper'

type Client = SupabaseClient<Database>

/**
 * Contatos recebidos pelo tenant, mais recentes primeiro. O imóvel de origem vem
 * por embed — sem ele a listagem mostraria só um UUID, sem dizer sobre o que o
 * cliente perguntou.
 */
export async function listLeads(client: Client, tenantId: string): Promise<Lead[]> {
  const { data, error } = await client
    .from('leads')
    .select('*, properties(code, title)')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((row) => {
    const { properties, ...rest } = row
    return toLeadModel(rest, properties ?? null)
  })
}

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
