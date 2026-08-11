import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~~/shared/types/database.types'
import type { Property, PropertyInput } from '~~/shared/models/property'
import { toPropertyModel, toPropertyRow } from '~~/server/mappers/property.mapper'

type Client = SupabaseClient<Database>
type PropertyImageRow = Database['public']['Tables']['property_images']['Row']

async function fetchImagesByProperty(client: Client, ids: string[]) {
  const map = new Map<string, PropertyImageRow[]>()
  if (!ids.length) return map
  const { data, error } = await client
    .from('property_images')
    .select('*')
    .in('property_id', ids)
    .order('position', { ascending: true })
  if (error) throw error
  for (const img of data ?? []) {
    const arr = map.get(img.property_id) ?? []
    arr.push(img)
    map.set(img.property_id, arr)
  }
  return map
}

async function attachImages(client: Client, rows: Database['public']['Tables']['properties']['Row'][]): Promise<Property[]> {
  const imagesByProp = await fetchImagesByProperty(client, rows.map((r) => r.id))
  return rows.map((r) => toPropertyModel(r, imagesByProp.get(r.id) ?? []))
}

/** Imóveis publicados (site público). */
export async function listActiveProperties(client: Client, tenantId: string): Promise<Property[]> {
  const { data, error } = await client
    .from('properties')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .order('featured', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return attachImages(client, data ?? [])
}

/** Todos os imóveis do tenant (painel — qualquer status). */
export async function listAllProperties(client: Client, tenantId: string): Promise<Property[]> {
  const { data, error } = await client
    .from('properties')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return attachImages(client, data ?? [])
}

export async function getPropertyByCode(client: Client, tenantId: string, code: string): Promise<Property | null> {
  const { data, error } = await client
    .from('properties')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('code', code)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const [model] = await attachImages(client, [data])
  return model ?? null
}

export async function getPropertyById(client: Client, tenantId: string, id: string): Promise<Property | null> {
  const { data, error } = await client
    .from('properties')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const [model] = await attachImages(client, [data])
  return model ?? null
}

async function replaceImages(client: Client, propertyId: string, input: PropertyInput) {
  await client.from('property_images').delete().eq('property_id', propertyId)
  const images = input.images ?? []
  if (!images.length) return
  const rows = images.map((img, i) => ({
    property_id: propertyId,
    url: img.url,
    alt: img.alt ?? null,
    position: img.position ?? i,
    is_cover: img.isCover ?? i === 0,
  }))
  const { error } = await client.from('property_images').insert(rows)
  if (error) throw error
}

export async function createProperty(client: Client, tenantId: string, input: PropertyInput): Promise<Property> {
  const { data, error } = await client
    .from('properties')
    .insert(toPropertyRow(input, tenantId))
    .select('*')
    .single()
  if (error) throw error
  await replaceImages(client, data.id, input)
  return (await getPropertyById(client, tenantId, data.id))!
}

export async function updateProperty(client: Client, tenantId: string, id: string, input: PropertyInput): Promise<Property> {
  const row = toPropertyRow(input, tenantId)
  const { error } = await client
    .from('properties')
    .update(row)
    .eq('tenant_id', tenantId)
    .eq('id', id)
  if (error) throw error
  await replaceImages(client, id, input)
  return (await getPropertyById(client, tenantId, id))!
}

export async function deleteProperty(client: Client, tenantId: string, id: string): Promise<void> {
  const { error } = await client.from('properties').delete().eq('tenant_id', tenantId).eq('id', id)
  if (error) throw error
}
