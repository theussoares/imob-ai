import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~~/shared/types/database.types'
import type { Broker, BrokerInput, PublicBroker } from '~~/shared/models/broker'
import { toBrokerModel, toBrokerRow, toPublicBrokerModel } from '~~/server/mappers/broker.mapper'

type Client = SupabaseClient<Database>

/**
 * Corretores que optaram por aparecer na vitrine pública ("Quem somos").
 *
 * Colunas explícitas de propósito — nunca `select('*')` aqui: isto roda com a
 * service_role (bypassa RLS) para alimentar uma página sem login, então quem
 * impede telefone/e-mail de vazar é este `select`, não a policy do banco.
 */
export async function listPublicBrokers(client: Client, tenantId: string): Promise<PublicBroker[]> {
  const { data, error } = await client
    .from('brokers')
    .select('id, name, photo_url, bio, creci')
    .eq('tenant_id', tenantId)
    .eq('active', true)
    .eq('public_visible', true)
    .order('name', { ascending: true })
  if (error) throw error
  return (data ?? []).map(toPublicBrokerModel)
}

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
