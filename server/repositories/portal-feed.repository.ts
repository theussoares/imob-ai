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
