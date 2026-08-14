/** Corretor cadastrado (por tenant). Dado interno — não exposto no site público. */
export interface Broker {
  id: string
  tenantId: string
  name: string
  phone: string | null
  email: string | null
  creci: string | null
  active: boolean
}

export interface BrokerInput {
  name: string
  phone?: string | null
  email?: string | null
  creci?: string | null
  active?: boolean
}
