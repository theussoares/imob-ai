/** Corretor cadastrado (por tenant). Dado interno — não exposto no site público. */
export interface Broker {
  id: string
  tenantId: string
  name: string
  phone: string | null
  email: string | null
  creci: string | null
  active: boolean
  /** URL da foto usada na vitrine pública. Sem relação com o CRM interno. */
  photoUrl: string | null
  /** Minibio para a vitrine pública. */
  bio: string | null
  /** Optou por aparecer no carrossel de corretores da página "Quem somos"? Padrão: não. */
  publicVisible: boolean
  /** Entra na roleta de leads (quando a imobiliária usa roleta). Padrão: não. */
  receivesLeads: boolean
  /** Último lead que a roleta entregou — define quem é o próximo. */
  lastLeadAt: string | null
}

export interface BrokerInput {
  name: string
  phone?: string | null
  email?: string | null
  creci?: string | null
  active?: boolean
  photoUrl?: string | null
  bio?: string | null
  publicVisible?: boolean
  receivesLeads?: boolean
}

/**
 * Recorte PÚBLICO do corretor — o que a vitrine da página "Quem somos" pode
 * mostrar. Nunca `phone`/`email`: são dados internos, mesmo para quem optou
 * por aparecer (a intermediação de contato continua sendo pelo WhatsApp da
 * imobiliária, não pelo corretor direto).
 */
export interface PublicBroker {
  id: string
  name: string
  photoUrl: string | null
  bio: string | null
  creci: string | null
}
