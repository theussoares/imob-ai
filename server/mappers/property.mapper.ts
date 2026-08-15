import type { Database } from '~~/shared/types/database.types'
import type { Property, PropertyCard, PropertyImage, PropertyInput } from '~~/shared/models/property'
import type { Broker } from '~~/shared/models/broker'

type PropertyRow = Database['public']['Tables']['properties']['Row']
type PropertyImageRow = Database['public']['Tables']['property_images']['Row']

/**
 * Só as colunas de imagem que os mappers realmente usam. As queries trazem as
 * imagens por embed do PostgREST selecionando exatamente estes campos (sem
 * created_at/property_id), então exigir a row completa aqui quebraria a tipagem.
 */
export type PropertyImageFields = Pick<
  PropertyImageRow,
  'id' | 'url' | 'url_sm' | 'alt' | 'position' | 'is_cover'
>
type PropertyInsert = Database['public']['Tables']['properties']['Insert']

/** Colunas públicas de properties (sem os campos internos: location, broker_id, owner_name, owner_phone). */
export type PublicPropertyRow = Pick<
  PropertyRow,
  | 'id'
  | 'tenant_id'
  | 'code'
  | 'title'
  | 'type'
  | 'purpose'
  | 'price'
  | 'neighborhood'
  | 'city'
  | 'state'
  | 'bedrooms'
  | 'bathrooms'
  | 'parking'
  | 'area'
  | 'high_standard'
  | 'description'
  | 'features'
  | 'status'
  | 'featured'
  | 'created_at'
  | 'updated_at'
>

export function toPropertyImageModel(row: PropertyImageFields): PropertyImage {
  return {
    id: row.id,
    url: row.url,
    urlSm: row.url_sm,
    alt: row.alt,
    position: row.position,
    isCover: row.is_cover,
  }
}

/** Converte uma row de imóvel (+ imagens) no modelo de domínio. */
export function toPropertyModel(
  row: PublicPropertyRow,
  images: PropertyImageFields[] = [],
): Property {
  const sorted = [...images].sort((a, b) => {
    if (a.is_cover !== b.is_cover) return a.is_cover ? -1 : 1
    return a.position - b.position
  })
  return {
    id: row.id,
    tenantId: row.tenant_id,
    code: row.code,
    title: row.title,
    type: row.type,
    purpose: row.purpose,
    price: Number(row.price),
    neighborhood: row.neighborhood,
    city: row.city,
    state: row.state,
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    parking: row.parking,
    area: Number(row.area),
    highStandard: row.high_standard,
    description: row.description,
    features: row.features ?? [],
    status: row.status,
    featured: row.featured,
    images: sorted.map(toPropertyImageModel),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** Colunas mínimas para montar um card do catálogo. */
export type PublicPropertyCardRow = Pick<
  PropertyRow,
  | 'id'
  | 'code'
  | 'title'
  | 'type'
  | 'purpose'
  | 'price'
  | 'neighborhood'
  | 'city'
  | 'bedrooms'
  | 'bathrooms'
  | 'parking'
  | 'area'
  | 'high_standard'
  | 'featured'
>

/** Modelo enxuto do card: só a capa, sem description/features/demais imagens. */
export function toPropertyCardModel(
  row: PublicPropertyCardRow,
  images: PropertyImageFields[] = [],
): PropertyCard {
  const cover = [...images].sort((a, b) => {
    if (a.is_cover !== b.is_cover) return a.is_cover ? -1 : 1
    return a.position - b.position
  })[0]
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    type: row.type,
    purpose: row.purpose,
    price: Number(row.price),
    neighborhood: row.neighborhood,
    city: row.city,
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    parking: row.parking,
    area: Number(row.area),
    highStandard: row.high_standard,
    featured: row.featured,
    cover: cover ? toPropertyImageModel(cover) : null,
  }
}

/** Modelo com os campos privados (uso interno do painel) + corretor captador. */
export function toPropertyAdminModel(
  row: PropertyRow,
  images: PropertyImageFields[] = [],
  broker: Broker | null = null,
): Property {
  return {
    ...toPropertyModel(row, images),
    location: row.location,
    brokerId: row.broker_id,
    broker,
    ownerName: row.owner_name,
    ownerPhone: row.owner_phone,
  }
}

/** Converte o payload do formulário na row de inserção/atualização. */
export function toPropertyRow(input: PropertyInput, tenantId: string): PropertyInsert {
  return {
    tenant_id: tenantId,
    code: input.code.trim(),
    title: input.title.trim(),
    type: input.type,
    purpose: input.purpose,
    price: input.price ?? 0,
    neighborhood: input.neighborhood ?? null,
    city: input.city ?? null,
    state: input.state ?? null,
    bedrooms: input.bedrooms ?? 0,
    bathrooms: input.bathrooms ?? 0,
    parking: input.parking ?? 0,
    area: input.area ?? 0,
    high_standard: input.highStandard ?? false,
    description: input.description ?? null,
    features: input.features ?? [],
    status: input.status ?? 'active',
    featured: input.featured ?? false,
    location: input.location ?? null,
    broker_id: input.brokerId ?? null,
    owner_name: input.ownerName ?? null,
    owner_phone: input.ownerPhone ?? null,
  }
}
