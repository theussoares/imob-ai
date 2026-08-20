import type { Broker } from './broker'

export type PropertyType = 'casa' | 'apartamento' | 'sobrado' | 'terreno'
export type PropertyPurpose = 'venda' | 'aluguel'
export type PropertyStatus = 'active' | 'sold' | 'rented' | 'draft'

export interface PropertyImage {
  id: string
  url: string
  /** Derivada de 640px (WebP) para srcset; null em imagens antigas ou por URL externa. */
  urlSm: string | null
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
  suites: number
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
  /**
   * Quem editou por último. Só vem nas leituras do painel — o catálogo público
   * não tem por que saber, e a coluna não é exposta ao papel `anon`.
   */
  updatedBy?: string | null
  // Campos privados (somente painel/admin) — nunca expostos no site público.
  location?: string | null
  brokerId?: string | null
  broker?: Broker | null
  ownerName?: string | null
  ownerPhone?: string | null
}

/**
 * Subconjunto de Property servido na listagem do catálogo. Só o que o card
 * realmente usa (inclusive pra filtrar e ordenar) + a imagem de capa — o modelo
 * completo carrega description, features e TODAS as imagens de cada imóvel, o que
 * multiplicava o payload da home por ~2,7.
 */
export interface PropertyCard {
  id: string
  code: string
  title: string
  type: PropertyType
  purpose: PropertyPurpose
  price: number
  neighborhood: string | null
  city: string | null
  bedrooms: number
  suites: number
  bathrooms: number
  parking: number
  area: number
  highStandard: boolean
  featured: boolean
  cover: PropertyImage | null
}

/** Payload de imagem enviado pelo painel ao criar/editar um imóvel. */
export interface PropertyImageInput {
  url: string
  urlSm?: string | null
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
  suites?: number
  bathrooms?: number
  parking?: number
  area?: number
  highStandard?: boolean
  description?: string | null
  features?: string[]
  status?: PropertyStatus
  featured?: boolean
  images?: PropertyImageInput[]
  // Campos privados (admin)
  location?: string | null
  brokerId?: string | null
  ownerName?: string | null
  ownerPhone?: string | null
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
