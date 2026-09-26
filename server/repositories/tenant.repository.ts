import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~~/shared/types/database.types'
import type { Tenant, TenantSettingsInput } from '~~/shared/models/tenant'
import type { TenantMember } from '~~/shared/models/member'
import type { AiTone } from '~~/shared/models/ai-tone'
import { tomValido } from '~~/shared/models/ai-tone'
import {
  TENANT_PUBLIC_SELECT,
  toTenantModel,
  toTenantUpdateRow,
  type TenantPublicRow,
} from '~~/server/mappers/tenant.mapper'

type Client = SupabaseClient<Database>

export async function getTenantByDomain(client: Client, domain: string): Promise<Tenant | null> {
  const { data, error } = await client
    .from('tenant_domains')
    .select(`tenant_id, tenants(${TENANT_PUBLIC_SELECT})`)
    .eq('domain', domain)
    .maybeSingle()
  if (error) throw error
  const tenantRow = (data as unknown as { tenants: TenantPublicRow | null })?.tenants
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
  const { data, error } = await client.from('tenants').select(TENANT_PUBLIC_SELECT).eq('slug', slug).maybeSingle()
  if (error) throw error
  return data ? toTenantModel(data as unknown as TenantPublicRow) : null
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
 * Desde a 0047 o `anon` não lê `ai_tone` pelo PostgREST (o grant de
 * `tenants` passou a ser por coluna). O que esta função garante além disso: o
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

export type LeadDistribution = 'manual' | 'roleta'

/**
 * Como a imobiliária distribui os leads do site (0049). Fora de
 * `TENANT_PUBLIC_COLUMNS` de propósito: é configuração interna, e o anon nem
 * tem grant na coluna.
 */
export async function getLeadDistribution(client: Client, tenantId: string): Promise<LeadDistribution> {
  const { data, error } = await client.from('tenants').select('lead_distribution').eq('id', tenantId).single()
  if (error) throw error
  return data.lead_distribution === 'roleta' ? 'roleta' : 'manual'
}

export async function setLeadDistribution(client: Client, tenantId: string, mode: LeadDistribution): Promise<void> {
  const { error } = await client.from('tenants').update({ lead_distribution: mode }).eq('id', tenantId)
  if (error) throw error
}
