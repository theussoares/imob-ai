import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~~/shared/types/database.types'
import type { Tenant, TenantSettingsInput } from '~~/shared/models/tenant'
import type { TenantMember } from '~~/shared/models/member'
import { toTenantModel, toTenantUpdateRow } from '~~/server/mappers/tenant.mapper'

type Client = SupabaseClient<Database>

export async function getTenantByDomain(client: Client, domain: string): Promise<Tenant | null> {
  const { data, error } = await client
    .from('tenant_domains')
    .select('tenant_id, tenants(*)')
    .eq('domain', domain)
    .maybeSingle()
  if (error) throw error
  const tenantRow = (data as unknown as { tenants: Database['public']['Tables']['tenants']['Row'] | null })?.tenants
  return tenantRow ? toTenantModel(tenantRow) : null
}

/**
 * Endereço oficial do tenant, ou `null` quando ele não tem um marcado.
 *
 * `is_primary` está na tabela desde a 0001 e nunca foi lido por nada. É o que
 * permite o site ter um endereço só quando a imobiliária ganha domínio próprio:
 * o subdomínio antigo da plataforma passa a redirecionar para cá.
 */
export async function getPrimaryDomain(client: Client, tenantId: string): Promise<string | null> {
  const { data, error } = await client
    .from('tenant_domains')
    .select('domain')
    .eq('tenant_id', tenantId)
    .eq('is_primary', true)
    .limit(1)
  if (error) throw error
  return data?.[0]?.domain ?? null
}

export async function getTenantBySlug(client: Client, slug: string): Promise<Tenant | null> {
  const { data, error } = await client.from('tenants').select('*').eq('slug', slug).maybeSingle()
  if (error) throw error
  return data ? toTenantModel(data) : null
}

export async function updateTenantSettings(
  client: Client,
  tenantId: string,
  input: TenantSettingsInput,
  updatedBy?: string,
): Promise<Tenant> {
  const { data, error } = await client
    .from('tenants')
    .update({ ...toTenantUpdateRow(input), updated_by: updatedBy ?? null })
    .eq('id', tenantId)
    .select('*')
    .single()
  if (error) throw error
  return toTenantModel(data)
}

export async function getMembership(
  client: Client,
  tenantId: string,
  userId: string,
): Promise<TenantMember | null> {
  const { data, error } = await client
    .from('tenant_members')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return { id: data.id, tenantId: data.tenant_id, userId: data.user_id, role: data.role }
}
