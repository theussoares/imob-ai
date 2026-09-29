import { randomBytes, timingSafeEqual } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~~/shared/types/database.types'
import type { Property } from '~~/shared/models/property'
import { toPropertyModel, type PublicPropertyRow } from '~~/server/mappers/property.mapper'

type Client = SupabaseClient<Database>

/**
 * Feed dos portais (ZAP, Viva Real, OLX).
 *
 * Tudo aqui roda pela service role: `portal_feeds` não tem policy (0058) e as
 * colunas de endereço não têm grant para anon nem authenticated. Por isso cada
 * query leva o `tenant_id` no where — aqui não há RLS para segurar nada.
 */

/**
 * Colunas do feed: as públicas do catálogo mais o endereço. Listadas à mão, não
 * `select('*')`: o feed é lido por quem tem o link, e `owner_name`,
 * `owner_phone`, `location` e `broker_id` não têm o que fazer num portal.
 */
const FEED_COLUMNS =
  'id, tenant_id, code, title, type, purpose, price, neighborhood, city, state, bedrooms, suites, bathrooms, parking, area, high_standard, description, features, status, featured, created_at, updated_at, address_zip, address_street, address_number'

const IMAGES_EMBED = 'property_images(id, url, url_sm, alt, position, is_cover)'

/** Imóveis publicados, com o endereço que o VRSync exige. */
export async function listPropertiesForPortalFeed(client: Client, tenantId: string): Promise<Property[]> {
  const { data, error } = await client
    .from('properties')
    .select(`${FEED_COLUMNS}, ${IMAGES_EMBED}`)
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((row) => {
    const { property_images: images, address_zip, address_street, address_number, ...rest } = row
    return {
      ...toPropertyModel(rest as PublicPropertyRow, images ?? []),
      addressZip: address_zip,
      addressStreet: address_street,
      addressNumber: address_number,
    }
  })
}

/**
 * Token do feed, criado na primeira vez que o painel pede o link.
 *
 * Criar sob demanda, e não numa migration para todos os tenants: tenant novo
 * nasceria sem token e o painel mostraria um link quebrado — o defeito exato
 * que este módulo existe para corrigir.
 *
 * O `upsert` com `ignoreDuplicates` resolve a corrida de duas abas abrindo a
 * tela ao mesmo tempo: a segunda não sobrescreve o token da primeira (que já
 * pode ter sido colado no Canal Pro), e a releitura devolve o que ficou.
 */
export async function getOrCreateFeedToken(client: Client, tenantId: string): Promise<string> {
  const existente = await readFeedToken(client, tenantId)
  if (existente) return existente

  const { error } = await client
    .from('portal_feeds')
    .upsert({ tenant_id: tenantId, token: randomBytes(24).toString('base64url') }, {
      onConflict: 'tenant_id',
      ignoreDuplicates: true,
    })
  if (error) throw error

  const token = await readFeedToken(client, tenantId)
  if (!token) throw new Error('portal_feeds: token não encontrado após criação')
  return token
}

async function readFeedToken(client: Client, tenantId: string): Promise<string | null> {
  const { data, error } = await client
    .from('portal_feeds')
    .select('token')
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (error) throw error
  return data?.token ?? null
}

/**
 * O token do link confere com o desta imobiliária?
 *
 * Compara pelo token do tenant resolvido pelo HOST, nunca buscando "de quem é
 * este token": assim o link de uma imobiliária não abre o feed dela em domínio
 * de outra, e um token vazado não serve para enumerar tenants.
 */
export async function feedTokenMatches(client: Client, tenantId: string, token: string): Promise<boolean> {
  const esperado = await readFeedToken(client, tenantId)
  if (!esperado || !token) return false
  const a = Buffer.from(esperado)
  const b = Buffer.from(token)
  return a.length === b.length && timingSafeEqual(a, b)
}

// ---------------------------------------------------------------------------
// Leads dos portais (0063)
// ---------------------------------------------------------------------------

export interface ConfigDeLeadsDoPortal {
  token: string
  autoWhatsapp: boolean
}

/**
 * Token da URL de leads, criado na primeira vez. Linha nova leva os DOIS
 * tokens: `token` (do feed) é obrigatório, e o feed não pode achar uma linha
 * sem ele. Linha que já existia só pelo feed ganha o de leads por um update
 * condicional (`is null`) — duas abas abrindo a tela ao mesmo tempo não trocam
 * o token uma da outra.
 */
export async function getOrCreateLeadsToken(client: Client, tenantId: string): Promise<ConfigDeLeadsDoPortal> {
  const atual = await readLeadsConfig(client, tenantId)
  if (atual?.token) return { token: atual.token, autoWhatsapp: atual.autoWhatsapp }

  if (!atual) {
    const { error } = await client.from('portal_feeds').upsert(
      { tenant_id: tenantId, token: randomBytes(24).toString('base64url'), leads_token: randomBytes(24).toString('base64url') },
      { onConflict: 'tenant_id', ignoreDuplicates: true },
    )
    if (error) throw error
  }
  const { error } = await client
    .from('portal_feeds')
    .update({ leads_token: randomBytes(24).toString('base64url') })
    .eq('tenant_id', tenantId)
    .is('leads_token', null)
  if (error) throw error

  const depois = await readLeadsConfig(client, tenantId)
  if (!depois?.token) throw new Error('portal_feeds: token de leads não encontrado após criação')
  return { token: depois.token, autoWhatsapp: depois.autoWhatsapp }
}

async function readLeadsConfig(client: Client, tenantId: string): Promise<{ token: string | null; autoWhatsapp: boolean } | null> {
  const { data, error } = await client
    .from('portal_feeds')
    .select('leads_token, leads_auto_whatsapp')
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (error) throw error
  return data ? { token: data.leads_token, autoWhatsapp: data.leads_auto_whatsapp } : null
}

/**
 * De quem é este token? É assim que o webhook descobre o tenant — o corpo do
 * Canal Pro não diz de qual imobiliária é o lead.
 */
export async function tenantByLeadsToken(client: Client, token: string): Promise<{ tenantId: string; autoWhatsapp: boolean } | null> {
  const { data, error } = await client
    .from('portal_feeds')
    .select('tenant_id, leads_auto_whatsapp')
    .eq('leads_token', token)
    .maybeSingle()
  if (error) throw error
  return data ? { tenantId: data.tenant_id, autoWhatsapp: data.leads_auto_whatsapp } : null
}

export async function setLeadsAutoWhatsapp(client: Client, tenantId: string, ligado: boolean): Promise<void> {
  const { error } = await client.from('portal_feeds').update({ leads_auto_whatsapp: ligado }).eq('tenant_id', tenantId)
  if (error) throw error
}

/**
 * Reserva o lead do portal. `false` = já recebido (reenvio do Canal Pro, ou
 * o mesmo lead por outro canal). O insert é a trava: dois reenvios
 * simultâneos não passam os dois.
 */
export async function claimPortalLead(client: Client, tenantId: string, originLeadId: string): Promise<boolean> {
  const { error } = await client.from('portal_lead_receipts').insert({ tenant_id: tenantId, origin_lead_id: originLeadId })
  if (!error) return true
  if ((error as { code?: string }).code === '23505') return false
  throw error
}

export async function setPortalLeadReceipt(client: Client, tenantId: string, originLeadId: string, leadId: string): Promise<void> {
  const { error } = await client
    .from('portal_lead_receipts')
    .update({ lead_id: leadId })
    .eq('tenant_id', tenantId)
    .eq('origin_lead_id', originLeadId)
  if (error) throw error
}

/**
 * Desfaz a reserva quando a gravação do lead falhou — senão o reenvio do
 * Canal Pro, que é justamente a segunda chance, seria descartado como
 * "já recebido" e o lead se perderia.
 */
export async function releasePortalLead(client: Client, tenantId: string, originLeadId: string): Promise<void> {
  const { error } = await client
    .from('portal_lead_receipts')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('origin_lead_id', originLeadId)
    .is('lead_id', null)
  if (error) throw error
}

/** Leads de portal recebidos por este tenant desde `desde` — para o teto. */
export async function countPortalLeadsSince(client: Client, tenantId: string, desde: string, soComWhatsapp = false): Promise<number> {
  let q = client.from('portal_lead_receipts').select('origin_lead_id', { count: 'exact', head: true }).eq('tenant_id', tenantId).gte('received_at', desde)
  if (soComWhatsapp) q = q.eq('whatsapp_enviado', true)
  const { count, error } = await q
  if (error) throw error
  return count ?? 0
}

export async function markPortalLeadWhatsapp(client: Client, tenantId: string, originLeadId: string): Promise<void> {
  const { error } = await client
    .from('portal_lead_receipts')
    .update({ whatsapp_enviado: true })
    .eq('tenant_id', tenantId)
    .eq('origin_lead_id', originLeadId)
  if (error) throw error
}

/**
 * Troca o token da URL de leads — para quando ela vazou. A URL antiga para de
 * funcionar na hora; a imobiliária cola a nova no Canal Pro.
 */
export async function rotateLeadsToken(client: Client, tenantId: string): Promise<string> {
  await getOrCreateLeadsToken(client, tenantId)
  const novo = randomBytes(24).toString('base64url')
  const { error } = await client.from('portal_feeds').update({ leads_token: novo }).eq('tenant_id', tenantId)
  if (error) throw error
  return novo
}
