import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~~/shared/types/database.types'
import type { Property, PropertyCard, PropertyInput, PropertyStatus } from '~~/shared/models/property'
import type { Broker, PublicBroker } from '~~/shared/models/broker'
import {
  toPropertyModel,
  toPropertyAdminModel,
  toPropertyCardModel,
  toPropertyRow,
  type PublicPropertyRow,
  type PropertyImageFields,
} from '~~/server/mappers/property.mapper'
import { toBrokerModel, toPublicBrokerModel } from '~~/server/mappers/broker.mapper'

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
  'id, code, title, type, purpose, price, neighborhood, city, bedrooms, suites, bathrooms, parking, area, high_standard, featured'

/**
 * Imagens via embed do PostgREST, numa query só. A alternativa (buscar os ids e
 * fazer `.in('property_id', ids)`) monta uma querystring com TODOS os UUIDs —
 * estoura o limite de URL entre ~400 e 600 imóveis — e ainda custa um
 * round-trip extra ao Supabase.
 */
const IMAGES_EMBED = 'property_images(id, url, url_sm, alt, position, is_cover)'

/** Teto de fotos por imóvel no card do catálogo — o carrossel não precisa de mais. */
const IMAGES_PER_CARD = 5

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
 * Captador para exibir na página do imóvel. Só o recorte de `PublicBroker`
 * (nome, foto, minibio, CRECI) — nunca telefone nem e-mail: o WhatsApp do site
 * é sempre o da imobiliária, e o contato direto do corretor não é público.
 *
 * Corretor inativo não aparece: quem saiu da imobiliária é desmarcado no
 * painel, mas os imóveis que captou continuam publicados, e o site não deve
 * seguir apresentando essa pessoa como contato. Colunas listadas à mão (não
 * `select('*')`) porque esta é leitura pública pela service_role.
 */
async function fetchPublicCaptador(client: Client, tenantId: string, brokerId: string): Promise<PublicBroker | null> {
  const { data, error } = await client
    .from('brokers')
    .select('id, name, photo_url, bio, creci')
    .eq('tenant_id', tenantId)
    .eq('id', brokerId)
    .eq('active', true)
    .limit(1)
  if (error) throw error
  const row = data?.[0]
  return row ? toPublicBrokerModel(row) : null
}

/**
 * Imóvel ativo do tenant pelo código, para o registro do clique de WhatsApp.
 *
 * O clique vai SEMPRE para o número da imobiliária, então não há corretor a
 * atribuir (`whatsapp_clicks.broker_id` fica nulo). Antes o link ia para o
 * telefone do captador e esta função devolvia o `broker_id` para o painel
 * dizer "foi para o corretor"; manter isso agora seria o painel afirmando uma
 * conversa que nunca aconteceu.
 */
export async function whatsappTargetForCode(
  client: Client,
  tenantId: string,
  code: string,
): Promise<{ propertyId: string; brokerId: null } | null> {
  const safeCode = code.replace(/[\\%_]/g, '\\$&')
  const { data, error } = await client
    .from('properties')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .ilike('code', safeCode)
    .limit(1)
  if (error) throw error
  const row = data?.[0]
  return row ? { propertyId: row.id, brokerId: null } : null
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
    // O card mostra um carrossel, não só a capa — mas sem isto o embed trazia
    // TODAS as fotos de cada imóvel (um imóvel com 20 fotos mandava 20 linhas
    // de url/url_sm pro carrossel usar 5), inflando o payload da home
    // proporcionalmente ao total de fotos do catálogo, não ao que a tela mostra.
    .order('is_cover', { ascending: false, referencedTable: 'property_images' })
    .order('position', { referencedTable: 'property_images' })
    .limit(IMAGES_PER_CARD, { referencedTable: 'property_images' })
  if (error) throw error
  return (data ?? []).map((row) => toPropertyCardModel(row, row.property_images ?? []))
}

/**
 * Todos os imóveis do tenant (painel — qualquer status).
 *
 * `opts` existe para o painel de gestão (`/api/gestao/imoveis`), que não é o
 * `/admin`: `brokerId` restringe ao corretor vendedor (perfil que só vê os
 * próprios), `limite` + `recentes` dão a listagem de 200 por `updated_at`.
 * Sem `opts` o comportamento do `/admin` é o de sempre.
 */
export async function listAllProperties(
  client: Client,
  tenantId: string,
  opts: { brokerId?: string; limite?: number; recentes?: boolean } = {},
): Promise<Property[]> {
  let query = client.from('properties').select(`*, ${IMAGES_EMBED}`).eq('tenant_id', tenantId)
  if (opts.brokerId) query = query.eq('broker_id', opts.brokerId)
  query = query.order(opts.recentes ? 'updated_at' : 'created_at', { ascending: false })
  if (opts.limite) query = query.limit(opts.limite)
  const { data, error } = await query
  if (error) throw error
  return attachBrokersAdmin(client, tenantId, data ?? [])
}

/** Imóveis do tenant por id (em lotes de 100), mesmas colunas e embed de `listAllProperties`. Lista vazia não vai ao banco. */
export async function listPropertiesByIds(client: Client, tenantId: string, ids: string[]): Promise<Property[]> {
  const out: Property[] = []
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await client
      .from('properties')
      .select(`*, ${IMAGES_EMBED}`)
      .eq('tenant_id', tenantId)
      .in('id', ids.slice(i, i + 100))
    if (error) throw error
    out.push(...(await attachBrokersAdmin(client, tenantId, data ?? [])))
  }
  return out
}

/**
 * Identidade mínima de todos os imóveis do tenant: o que o gestão precisa para
 * gerar o próximo código e recusar título+endereço repetido, sem trazer a ficha
 * inteira. Colunas listadas à mão — nenhuma interna além de `location`, que só
 * serve para comparar e nunca sai na resposta.
 */
export async function listPropertyIdentities(
  client: Client,
  tenantId: string,
): Promise<{ id: string; code: string; title: string; location: string | null }[]> {
  const { data, error } = await client
    .from('properties')
    .select('id, code, title, location')
    .eq('tenant_id', tenantId)
  if (error) throw error
  return (data ?? []).map((r) => ({ id: r.id, code: r.code, title: r.title, location: r.location }))
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
 * Versão do detalhe com o captador (quando existir e estiver ativo).
 *
 * Mesma lista de colunas públicas do `getPropertyByCode` + `broker_id`: nada de
 * `select('*')` aqui, que arrastaria as colunas internas (owner_name,
 * owner_phone, location, updated_by) para dentro de uma leitura pública.
 */
export async function getPropertyByCodeWithCaptador(
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

  return { ...model, capturedBy: await fetchPublicCaptador(client, tenantId, broker_id) }
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

/**
 * O código é único por imobiliária (`properties_tenant_id_code_key`). Sem esta
 * tradução o erro cru do Postgres subia pelo `throw error` até o Nitro, que o
 * registra como 500 "unhandled" e responde sem `statusMessage` — a tela então
 * caía no texto genérico "Não foi possível salvar. Verifique os campos.".
 *
 * O estrago não é o 500 no log: é mandar conferir campo por campo um cadastro
 * que está inteiro certo, menos o código. Em 28/08 uma cliente tentou três
 * vezes seguidas em oito segundos, porque nada na tela dizia o que estava
 * errado. O código dela já existia em outro imóvel.
 *
 * Só o 23505 é traduzido. Qualquer outra falha do banco continua subindo como
 * está: dizer "código repetido" para um erro que não é esse mandaria a pessoa
 * mexer no campo errado e ainda esconderia o problema de verdade.
 *
 * A tabela tem uma única constraint UNIQUE além da chave primária (que é uuid
 * gerado, nunca colide), então 23505 aqui é sempre o código.
 */
function assertCodigoLivre(error: unknown, code: string): void {
  if ((error as { code?: string } | null)?.code !== '23505') return
  throw createError({
    statusCode: 409,
    statusMessage: `Já existe um imóvel com o código ${code.trim()} nesta imobiliária. Use outro código, ou edite o imóvel que já está cadastrado com ele.`,
  })
}

/**
 * Grafias de bairro já cadastradas na imobiliária, da mais usada para a menos.
 *
 * Alimenta duas coisas: a canonização na escrita (`canonicalNeighborhood`) e a
 * lista de sugestões do formulário. A ordem por frequência importa nas duas —
 * é a grafia que a imobiliária mais usa que deve vencer, não a primeira que
 * alguém digitou.
 *
 * Lê `status` nenhum de propósito: rascunho também conta, senão o segundo
 * imóvel de um bairro novo não encontraria o primeiro.
 */
export async function listNeighborhoods(client: Client, tenantId: string): Promise<string[]> {
  const { data, error } = await client
    .from('properties')
    .select('neighborhood')
    .eq('tenant_id', tenantId)
    .not('neighborhood', 'is', null)
  if (error) throw error

  const freq = new Map<string, number>()
  for (const row of data ?? []) {
    const v = (row.neighborhood || '').trim()
    if (v) freq.set(v, (freq.get(v) ?? 0) + 1)
  }
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v)
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
  assertCodigoLivre(error, input.code)
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
  return applyPropertyUpdate(client, tenantId, id, input, expectedUpdatedAt, updatedBy, true)
}

/**
 * Atualiza só os dados do imóvel e NÃO mexe em `property_images`.
 *
 * Existe para o painel de gestão, cujo formulário não carrega as fotos (elas
 * têm endpoints próprios). Passar as imagens relidas para `updateProperty`
 * serviria, mas `replaceImages` apaga tudo e reinsere: um upload concorrente
 * ficaria sem foto, e cada salvamento de texto trocaria os ids de todas elas.
 */
export async function updatePropertySemImagens(
  client: Client,
  tenantId: string,
  id: string,
  input: PropertyInput,
  expectedUpdatedAt?: string | null,
  updatedBy?: string,
): Promise<Property> {
  return applyPropertyUpdate(client, tenantId, id, input, expectedUpdatedAt, updatedBy, false)
}

async function applyPropertyUpdate(
  client: Client,
  tenantId: string,
  id: string,
  input: PropertyInput,
  expectedUpdatedAt: string | null | undefined,
  updatedBy: string | undefined,
  trocarImagens: boolean,
): Promise<Property> {
  // Quem editou por último. Vem do usuário autenticado no endpoint, nunca do
  // payload — o cliente poderia dizer que foi outra pessoa.
  const row = { ...toPropertyRow(input, tenantId), updated_by: updatedBy ?? null }
  let query = client.from('properties').update(row).eq('tenant_id', tenantId).eq('id', id)
  if (expectedUpdatedAt) query = query.eq('updated_at', expectedUpdatedAt)
  const { data, error } = await query.select('id')
  assertCodigoLivre(error, input.code)
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

  if (trocarImagens) await replaceImages(client, id, input)
  return (await getPropertyById(client, tenantId, id))!
}

export async function deleteProperty(client: Client, tenantId: string, id: string): Promise<void> {
  const { error } = await client.from('properties').delete().eq('tenant_id', tenantId).eq('id', id)
  if (error) throw error
}

export async function updatePropertyFeatured(
  client: Client,
  tenantId: string,
  id: string,
  featured: boolean,
): Promise<Property> {
  const { error } = await client
    .from('properties')
    .update({ featured })
    .eq('tenant_id', tenantId)
    .eq('id', id)
  if (error) throw error
  return (await getPropertyById(client, tenantId, id))!
}

/** Muda só o status (anúncio). Quem editou por último é gravado, como no `updateProperty`. */
export async function updatePropertyStatus(
  client: Client,
  tenantId: string,
  id: string,
  status: PropertyStatus,
  updatedBy?: string,
): Promise<Property> {
  const { error } = await client
    .from('properties')
    .update({ status, updated_by: updatedBy ?? null })
    .eq('tenant_id', tenantId)
    .eq('id', id)
  if (error) throw error
  return (await getPropertyById(client, tenantId, id))!
}

/**
 * Fotos, uma operação por vez. `property_images` não tem `tenant_id`: o isolamento
 * é conferir ANTES que o imóvel é do tenant, e filtrar cada mudança por
 * `property_id`. Sem a conferência, um `propertyId` de outra imobiliária deixaria
 * o painel de uma escrever foto na outra (service_role ignora RLS).
 */
async function assertPropertyInTenant(client: Client, tenantId: string, propertyId: string): Promise<void> {
  const { data, error } = await client
    .from('properties')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('id', propertyId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw createError({ statusCode: 404, statusMessage: 'Imóvel não encontrado.' })
}

export async function insertPropertyImages(
  client: Client,
  tenantId: string,
  propertyId: string,
  images: { url: string; urlSm: string | null; alt: string | null; position: number; isCover: boolean }[],
): Promise<void> {
  await assertPropertyInTenant(client, tenantId, propertyId)
  if (!images.length) return
  const rows = images.map((i) => ({
    property_id: propertyId,
    url: i.url,
    url_sm: i.urlSm,
    alt: i.alt,
    position: i.position,
    is_cover: i.isCover,
  }))
  const { error } = await client.from('property_images').insert(rows)
  if (error) throw error
}

/** Regrava `position`/`is_cover` das fotos informadas (capa e ordem). */
export async function updatePropertyImageOrder(
  client: Client,
  tenantId: string,
  propertyId: string,
  images: { id: string; position: number; isCover: boolean }[],
): Promise<void> {
  await assertPropertyInTenant(client, tenantId, propertyId)
  for (const i of images) {
    const { error } = await client
      .from('property_images')
      .update({ position: i.position, is_cover: i.isCover })
      .eq('property_id', propertyId)
      .eq('id', i.id)
    if (error) throw error
  }
}

/** Remove a linha da foto. O objeto no Storage fica: a varredura de órfãos o recolhe, como no `/admin`. */
export async function deletePropertyImage(
  client: Client,
  tenantId: string,
  propertyId: string,
  imageId: string,
): Promise<void> {
  await assertPropertyInTenant(client, tenantId, propertyId)
  const { error } = await client.from('property_images').delete().eq('property_id', propertyId).eq('id', imageId)
  if (error) throw error
}
