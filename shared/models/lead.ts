/** Contato/lead capturado pelo formulário público. */
export interface Lead {
  id: string
  tenantId: string
  propertyId: string | null
  name: string | null
  phone: string | null
  message: string | null
  source: string
  createdAt: string
  /** Imóvel de origem do contato (null quando veio da home ou foi excluído). */
  property?: { code: string; title: string } | null
}

export interface LeadInput {
  name: string
  phone: string
  message?: string | null
  propertyCode?: string | null
  source?: string
}
