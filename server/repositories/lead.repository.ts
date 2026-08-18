import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~~/shared/types/database.types'
import type { Lead, LeadCreateInput, LeadSource, LeadType, LeadUpdateInput } from '~~/shared/models/lead'
import { toLeadModel } from '~~/server/mappers/lead.mapper'
import { toLeadSource } from '~~/shared/models/lead'

type Client = SupabaseClient<Database>
type LeadUpdateRow = Database['public']['Tables']['leads']['Update']

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
  source: LeadSource
  leadType: LeadType
}

export async function createLead(client: Client, args: CreateLeadArgs): Promise<void> {
  const { error } = await client.from('leads').insert({
    tenant_id: args.tenantId,
    property_id: args.propertyId,
    name: args.name,
    phone: args.phone,
    message: args.message,
    source: args.source,
    lead_type: args.leadType,
  })
  if (error) throw error
}

/** Cadastro manual pelo painel — o contato que chegou por WhatsApp/indicação. */
export async function createManualLead(client: Client, tenantId: string, input: LeadCreateInput): Promise<Lead> {
  const { data, error } = await client
    .from('leads')
    .insert({
      tenant_id: tenantId,
      name: input.name,
      phone: input.phone ?? null,
      message: input.message ?? null,
      stage: input.stage ?? 'novo',
      notes: input.notes ?? null,
      next_contact_at: input.nextContactAt ?? null,
      broker_id: input.brokerId ?? null,
      source: toLeadSource(input.source ?? 'manual'),
      lead_type: input.leadType ?? 'indefinido',
    })
    .select('*, properties(code, title)')
    .single()
  if (error) throw error
  const { properties, ...rest } = data
  return toLeadModel(rest, properties ?? null)
}

/** Atualiza um lead (mover no funil, anotar, agendar retorno). Só os campos enviados. */
export async function updateLead(client: Client, tenantId: string, id: string, input: LeadUpdateInput): Promise<Lead> {
  const patch: LeadUpdateRow = {}
  if (input.name !== undefined) patch.name = input.name
  if (input.phone !== undefined) patch.phone = input.phone
  if (input.stage !== undefined) patch.stage = input.stage
  if (input.leadType !== undefined) patch.lead_type = input.leadType
  if (input.notes !== undefined) patch.notes = input.notes
  if (input.nextContactAt !== undefined) patch.next_contact_at = input.nextContactAt
  if (input.brokerId !== undefined) patch.broker_id = input.brokerId

  const { data, error } = await client
    .from('leads')
    .update(patch)
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .select('*, properties(code, title)')
    .single()
  if (error) throw error
  const { properties, ...rest } = data
  return toLeadModel(rest, properties ?? null)
}

export async function deleteLead(client: Client, tenantId: string, id: string): Promise<void> {
  const { error } = await client.from('leads').delete().eq('tenant_id', tenantId).eq('id', id)
  if (error) throw error
}
