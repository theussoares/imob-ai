import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~~/shared/types/database.types'
import type { PortalUser, PortalUserInput } from '~~/shared/models/portal'
import { toPortalUserModel, toPortalUserRow } from '~~/server/mappers/portal-user.mapper'

type Client = SupabaseClient<Database>

export async function listPortalUsers(client: Client, tenantId: string): Promise<PortalUser[]> {
  const { data, error } = await client
    .from('portal_users')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('name', { ascending: true })
  if (error) throw error
  return (data ?? []).map(toPortalUserModel)
}

export async function getPortalUser(
  client: Client,
  tenantId: string,
  id: string,
): Promise<PortalUser | null> {
  const { data, error } = await client
    .from('portal_users')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data ? toPortalUserModel(data) : null
}

export async function createPortalUser(
  client: Client,
  tenantId: string,
  userId: string,
  input: PortalUserInput,
): Promise<PortalUser> {
  const { data, error } = await client
    .from('portal_users')
    .insert(toPortalUserRow(input, tenantId, userId))
    .select('*')
    .single()
  if (error) throw error
  return toPortalUserModel(data)
}

/**
 * Liga e desliga o acesso sem apagar histórico.
 *
 * Com `active = false` a pessoa para de passar nas policies do portal, mas a
 * trilha de quem baixou o quê continua de pé — que é justamente o que não pode
 * sumir quando um contrato encerra.
 *
 * (A checagem de `active` é feita INLINE por cada policy, não por
 * `is_portal_user()`: essa função existe desde a 0028 e nenhuma policy a chama.
 * Ver a nota no topo da 0036.)
 */
export async function setPortalUserActive(
  client: Client,
  tenantId: string,
  id: string,
  active: boolean,
): Promise<PortalUser> {
  const { data, error } = await client
    .from('portal_users')
    .update({ active })
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .select('*')
    // `maybeSingle`: com `single`, um id que não é deste tenant (ou que acabou
    // de ser apagado noutra aba) sairia como 500 em vez de 404.
    .maybeSingle()
  if (error) throw error
  if (!data) throw createError({ statusCode: 404, statusMessage: 'Cliente não encontrado.' })
  return toPortalUserModel(data)
}
