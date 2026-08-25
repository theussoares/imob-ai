import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~~/shared/types/database.types'
import type { Property, PropertyCard, PropertyInput } from '~~/shared/models/property'
import type { Broker } from '~~/shared/models/broker'
import {
  toPropertyModel,
  toPropertyAdminModel,
  toPropertyCardModel,
  toPropertyRow,
  type PublicPropertyRow,
  type PropertyImageFields,
} from '~~/server/mappers/property.mapper'
import { toBrokerModel } from '~~/server/mappers/broker.mapper'

type Client = SupabaseClient<Database>
type PropertyRow = Database['public']['Tables']['properties']['Row']
type PropertyImageRow = Database['public']['Tables']['property_images']['Row']

/**
 * Colunas públicas de properties. `select('*')` não pode ser usado nas leituras
 * como anon: o Postgrest expande `*` para todas as colunas da tabela (inclusive
 * as internas, com SELECT revogado para anon) e a query inteira falha com
 * "permission denied for table properties". Listando só as colunas públicas,
 * o Postgrest gera a query apenas com elas.
 */
const PUBLIC_PROPERTY_COLUMNS =
  'id, tenant_id, code, title, type, purpose, price, neighborhood, city, state, bedrooms, suites, bathrooms, parking, area, high_standard, description, features, status, featured, created_at, updated_at'

/** Colunas mínimas do card (o catálogo não precisa de description/features). */
const PUBLIC_CARD_COLUMNS =
  'id, code, title, type, purpose, price, neighborhood, city, bedrooms, suites, bathrooms, parking, area, high_standard, featured, broker_id'

/**
 * Imagens via embed do PostgREST, numa query só. A alternativa (buscar os ids e
 * fazer `.in('property_id', ids)`) monta uma querystring com TODOS os UUIDs —
 * estoura o limite de URL entre ~400 e 600 imóveis — e ainda custa um
 * round-trip extra ao Supabase.
 */
const IMAGES_EMBED = 'property_images(id, url, url_sm, alt, position, is_cover)'

async function fetchBrokersById(client: Client, tenantId: string, ids: string[]): Promise<Map<string, Broker>> {
  const map = new Map<string, Broker>()
  const unique = [...new Set(ids.filter(Boolean))]
  if (!unique.length) return map
  const { data, error } = await client.from('brokers').select('*').eq('tenant_id', tenantId).in('id', unique)
  if (error) throw error
  for (const b of data ?? []) map.set(b.id, toBrokerModel(b))
  return map
}

/**
 * Telefone do captador para uso PÚBLICO. Corretor inativo não pode seguir
 * recebendo os leads do site: quem saiu da imobiliária é desmarcado no painel,
 * mas os imóveis que captou continuam publicados. Sem telefone aqui, o link do
 * WhatsApp cai no número da imobiliária.
 *
 * Separado de `fetchBrokersById` de propósito: o painel precisa ver o corretor
 * inativo (é o que desenha o selo "Inativo"), só o site é que não.
 */
function publicBrokerPhone(brokers: Map<string, Broker>, brokerId: string | null): string | null {
  if (!brokerId) return null
  const broker = brokers.get(brokerId)
  if (!broker?.active) return null
  return broker.phone ?? null
}

/** Monta o modelo admin (campos privados + corretor) a partir das rows já com imagens embutidas. */
type AdminRowWithImages = PropertyRow & { property_images?: PropertyImageFields[] | null }
async function attachBrokersAdmin(client: Client, tenantId: string, rows: AdminRowWithImages[]): Promise<Property[]> {
  const brokers = await fetchBrokersById(client, tenantId, rows.map((r) => r.broker_id ?? '').filter(Boolean))
  return rows.map((r) => {
    const { property_images: images, ...rest } = r
    return toPropertyAdminModel(
      rest as PropertyRow,
      images ?? [],
      r.broker_id ? (brokers.get(r.broker_id) ?? null) : null,
    )
  })
}

/**
 * Imóveis publicados, modelo COMPLETO (sitemap, llms.txt e o markdown para
 * agentes precisam de description/features e de todas as imagens).
 * O catálogo do site usa `listActivePropertyCards`, que é bem mais enxuto.
 */
export async function listActiveProperties(client: Client, tenantId: string): Promise<Property[]> {
  const { data, error } = await client
    .from('properties')
    .select(`${PUBLIC_PROPERTY_COLUMNS}, ${IMAGES_EMBED}`)
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .order('featured', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((row) => {
    const { property_images: images, ...rest } = row
    return toPropertyModel(rest, images ?? [])
  })
}

/** Imóveis publicados, modelo enxuto para os cards do catálogo. */
export async function listActivePropertyCards(client: Client, tenantId: string): Promise<PropertyCard[]> {
  const { data, error } = await client
    .from('properties')
    .select(`${PUBLIC_CARD_COLUMNS}, ${IMAGES_EMBED}`)
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .order('featured', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  const brokers = await fetchBrokersById(
    client,
    tenantId,
    (data ?? []).map((row) => row.broker_id ?? '').filter(Boolean),
  )
  return (data ?? []).map((row) => {
    const { property_images: images, broker_id, ...rest } = row
    return toPropertyCardModel(rest, images ?? [], publicBrokerPhone(brokers, broker_id))
  })
}

/** Todos os imóveis do tenant (painel — qualquer status). */
export async function listAllProperties(client: Client, tenantId: string): Promise<Property[]> {
  const { data, error } = await client
    .from('properties')
    .select(`*, ${IMAGES_EMBED}`)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return attachBrokersAdmin(client, tenantId, data ?? [])
}

export async function getPropertyByCode(client: Client, tenantId: string, code: string): Promise<Property | null> {
  // `%` e `_` são curingas no ilike: sem escapar, /casa-3-quartos-centro/% casaria com tudo.
  const safeCode = code.replace(/[\\%_]/g, '\\$&')
  const { data, error } = await client
    .from('properties')
    .select(`${PUBLIC_PROPERTY_COLUMNS}, ${IMAGES_EMBED}`)
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .ilike('code', safeCode) // busca por código é case-insensitive (NC-0231 = nc-0231)
    .limit(1)
  if (error) throw error
  const row = data?.[0]
  if (!row) return null
  const { property_images: images, ...rest } = row
  return toPropertyModel(rest, images ?? [])
}

/**
 * Versão do detalhe com telefone do corretor captador (quando existir).
 *
 * Mesma lista de colunas públicas do `getPropertyByCode` + `broker_id`: nada de
 * `select('*')` aqui, que arrastaria as colunas internas (owner_name,
 * owner_phone, location, updated_by) para dentro de uma leitura pública.
 */
export async function getPropertyByCodeWithBrokerPhone(
  client: Client,
  tenantId: string,
  code: string,
): Promise<Property | null> {
  // `%` e `_` são curingas no ilike: sem escapar, /casa-3-quartos-centro/% casaria com tudo.
  const safeCode = code.replace(/[\\%_]/g, '\\$&')
  const { data, error } = await client
    .from('properties')
    .select(`${PUBLIC_PROPERTY_COLUMNS}, broker_id, ${IMAGES_EMBED}`)
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .ilike('code', safeCode)
    .limit(1)
  if (error) throw error
  const row = data?.[0]
  if (!row) return null

  const { property_images: images, broker_id, ...rest } = row
  const model = toPropertyModel(rest as PublicPropertyRow, images ?? [])
  if (!broker_id) return model

  const brokers = await fetchBrokersById(client, tenantId, [broker_id])
  return {
    ...model,
    brokerPhone: publicBrokerPhone(brokers, broker_id),
  }
}

export async function getPropertyById(client: Client, tenantId: string, id: string): Promise<Property | null> {
  const { data, error } = await client
    .from('properties')
    .select(`*, ${IMAGES_EMBED}`)
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const [model] = await attachBrokersAdmin(client, tenantId, [data])
  return model ?? null
}

async function replaceImages(client: Client, propertyId: string, input: PropertyInput) {
  await client.from('property_images').delete().eq('property_id', propertyId)
  const images = input.images ?? []
  if (!images.length) return
  const rows = images.map((img, i) => ({
    property_id: propertyId,
    url: img.url,
    url_sm: img.urlSm ?? null,
    alt: img.alt ?? null,
    position: img.position ?? i,
    is_cover: img.isCover ?? i === 0,
  }))
  const { error } = await client.from('property_images').insert(rows)
  if (error) throw error
}

export async function createProperty(
  client: Client,
  tenantId: string,
  input: PropertyInput,
  createdBy?: string,
): Promise<Property> {
  const { data, error } = await client
    .from('properties')
    // Já grava o autor na criação: sem isso um imóvel nunca editado apareceria
    // sem responsável, que é justamente quando a pergunta costuma surgir.
    .insert({ ...toPropertyRow(input, tenantId), updated_by: createdBy ?? null })
    .select('*')
    .single()
  if (error) throw error
  await replaceImages(client, data.id, input)
  return (await getPropertyById(client, tenantId, data.id))!
}

/**
 * Atualiza um imóvel.
 *
 * `expectedUpdatedAt` é a versão que a tela carregou. Com ela o update só
 * aplica se a linha ainda estiver nessa versão — sem isso o salvamento é
 * last-write-wins silencioso, e com várias pessoas no mesmo painel alguém perde
 * trabalho sem ver erro nenhum.
 *
 * O estrago maior não é o texto sobrescrito: `replaceImages` apaga TODAS as
 * imagens antes de reinserir as do payload, então salvar com a tela velha
 * apagaria as fotos que outra pessoa acabou de subir. Por isso a verificação
 * vem antes e nada encosta em `property_images` num salvamento recusado.
 *
 * Quando a versão não vem, salva sem trava: aba já aberta continua mandando o
 * payload antigo depois de um deploy, e exigir o campo derrubaria quem está no
 * meio de um cadastro. A trava aperta sozinha conforme as abas recarregam.
 */
export async function updateProperty(
  client: Client,
  tenantId: string,
  id: string,
  input: PropertyInput,
  expectedUpdatedAt?: string | null,
  updatedBy?: string,
): Promise<Property> {
  // Quem editou por último. Vem do usuário autenticado no endpoint, nunca do
  // payload — o cliente poderia dizer que foi outra pessoa.
  const row = { ...toPropertyRow(input, tenantId), updated_by: updatedBy ?? null }
  let query = client.from('properties').update(row).eq('tenant_id', tenantId).eq('id', id)
  if (expectedUpdatedAt) query = query.eq('updated_at', expectedUpdatedAt)
  const { data, error } = await query.select('id')
  if (error) throw error

  if (expectedUpdatedAt && !(data ?? []).length) {
    // Zero linhas tem duas causas: a versão mudou, ou o imóvel sumiu. Dizer
    // "não encontrado" para um conflito mandaria a pessoa procurar o problema
    // no lugar errado.
    const { data: existing } = await client
      .from('properties')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .maybeSingle()
    throw createError(
      existing
        ? {
            statusCode: 409,
            statusMessage:
              'Alguém alterou este imóvel enquanto você editava. Recarregue a página para ver a versão atual.',
          }
        : { statusCode: 404, statusMessage: 'Imóvel não encontrado.' },
    )
  }

  await replaceImages(client, id, input)
  return (await getPropertyById(client, tenantId, id))!
}

export async function deleteProperty(client: Client, tenantId: string, id: string): Promise<void> {
  const { error } = await client.from('properties').delete().eq('tenant_id', tenantId).eq('id', id)
  if (error) throw error
}
