export type PropertyType = 'casa' | 'apartamento' | 'sobrado' | 'terreno'
export type PropertyPurpose = 'venda' | 'aluguel'
export type PropertyStatus = 'active' | 'sold' | 'rented' | 'draft'

export interface PropertyImage {
  id: string
  url: string
  alt: string | null
  position: number
  isCover: boolean
}

/** Modelo de domínio de um imóvel (camelCase), consumido por site e painel. */
export interface Property {
  id: string
  tenantId: string
  code: string
  title: string
  type: PropertyType
  purpose: PropertyPurpose
  price: number
  neighborhood: string | null
  city: string | null
  state: string | null
  bedrooms: number
  bathrooms: number
  parking: number
  area: number
  highStandard: boolean
  description: string | null
  features: string[]
  status: PropertyStatus
  featured: boolean
  images: PropertyImage[]
  createdAt: string
  updatedAt: string
}

/** Payload de imagem enviado pelo painel ao criar/editar um imóvel. */
export interface PropertyImageInput {
  url: string
  alt?: string | null
  position?: number
  isCover?: boolean
}

/** Payload de criação/edição de imóvel (vindo do formulário do painel). */
export interface PropertyInput {
  code: string
  title: string
  type: PropertyType
  purpose: PropertyPurpose
  price: number
  neighborhood?: string | null
  city?: string | null
  state?: string | null
  bedrooms?: number
  bathrooms?: number
  parking?: number
  area?: number
  highStandard?: boolean
  description?: string | null
  features?: string[]
  status?: PropertyStatus
  featured?: boolean
  images?: PropertyImageInput[]
}

export const PROPERTY_TYPES: PropertyType[] = ['casa', 'apartamento', 'sobrado', 'terreno']
export const PROPERTY_STATUSES: PropertyStatus[] = ['active', 'draft', 'sold', 'rented']

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  casa: 'Casa',
  apartamento: 'Apartamento',
  sobrado: 'Sobrado',
  terreno: 'Terreno',
}

export const PROPERTY_STATUS_LABELS: Record<PropertyStatus, string> = {
  active: 'Publicado',
  draft: 'Rascunho',
  sold: 'Vendido',
  rented: 'Alugado',
}
