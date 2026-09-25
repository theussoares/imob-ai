import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~~/shared/types/database.types'
import type { Tenant, TenantSettingsInput } from '~~/shared/models/tenant'
import type { TenantMember } from '~~/shared/models/member'
import type { AiTone } from '~~/shared/models/ai-tone'
import { tomValido } from '~~/shared/models/ai-tone'
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

/**
 * Tenant pelo id. Para quem não tem requisição de onde tirar o tenant — o cron
 * de lembrete de leads, que recebe só o `tenant_id` da linha.
 */
export async function getTenantById(client: Client, id: string): Promise<Tenant | null> {
  const { data, error } = await client.from('tenants').select('*').eq('id', id).maybeSingle()
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

/**
 * Tom da descrição por IA, para o endpoint de geração.
 *
 * O tom NÃO é dado sensível — `anon` tem `GRANT SELECT` na tabela `tenants`
 * inteira e conseguiria ler `ai_tone` direto pelo PostgREST com a chave que já
 * vai no HTML de qualquer site. O que esta função garante é mais estreito: o
 * tom fica fora do payload de `/api/tenant`, porque não é campo de
 * `Tenant`/`toTenantModel` — e aquele endpoint devolve `useTenantContext(event)`
 * INTEIRO, sem seleção de campo nenhuma, então qualquer propriedade que
 * entrasse no modelo sairia junto. `select('ai_tone')` explícito (nunca
 * `select('*')`) é só higiene de leitura, não a barreira de privacidade.
 */
export async function getAiTone(client: Client, tenantId: string): Promise<AiTone> {
  const { data, error } = await client
    .from('tenants')
    .select('ai_tone')
    .eq('id', tenantId)
    .maybeSingle()
  if (error) throw error
  return tomValido(data?.ai_tone)
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
