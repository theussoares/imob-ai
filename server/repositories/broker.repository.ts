import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~~/shared/types/database.types'
import type { Broker, BrokerInput } from '~~/shared/models/broker'
import { toBrokerModel, toBrokerRow } from '~~/server/mappers/broker.mapper'

type Client = SupabaseClient<Database>

export async function listBrokers(client: Client, tenantId: string): Promise<Broker[]> {
  const { data, error } = await client
    .from('brokers')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('name', { ascending: true })
  if (error) throw error
  return (data ?? []).map(toBrokerModel)
}

export async function getBroker(client: Client, tenantId: string, id: string): Promise<Broker | null> {
  const { data, error } = await client
    .from('brokers')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data ? toBrokerModel(data) : null
}

export async function createBroker(client: Client, tenantId: string, input: BrokerInput): Promise<Broker> {
  const { data, error } = await client.from('brokers').insert(toBrokerRow(input, tenantId)).select('*').single()
  if (error) throw error
  return toBrokerModel(data)
}

export async function updateBroker(
  client: Client,
  tenantId: string,
  id: string,
  input: BrokerInput,
): Promise<Broker> {
  const { data, error } = await client
    .from('brokers')
    .update(toBrokerRow(input, tenantId))
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return toBrokerModel(data)
}

export async function deleteBroker(client: Client, tenantId: string, id: string): Promise<void> {
  const { error } = await client.from('brokers').delete().eq('tenant_id', tenantId).eq('id', id)
  if (error) throw error
}
