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
}

export interface LeadInput {
  name: string
  phone: string
  message?: string | null
  propertyCode?: string | null
  source?: string
}
