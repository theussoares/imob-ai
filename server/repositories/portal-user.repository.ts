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
 * É o que `is_portal_user()` consulta: com `active = false` a pessoa para de
 * passar em toda policy do portal, mas a trilha de quem baixou o quê continua
 * de pé — que é justamente o que não pode sumir quando um contrato encerra.
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
    .single()
  if (error) throw error
  return toPortalUserModel(data)
}
