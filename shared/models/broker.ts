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

/**
 * Para onde vai o WhatsApp do imóvel (0059). Por imobiliária, não por imóvel:
 * é política comercial da casa, e um seletor em cada cadastro viraria uma
 * mistura que ninguém consegue explicar ao visitante.
 */
export const WHATSAPP_TARGETS = ['captador', 'imobiliaria'] as const
export type WhatsappTarget = (typeof WHATSAPP_TARGETS)[number]

export const WHATSAPP_TARGET_LABELS: Record<WhatsappTarget, string> = {
  captador: 'Corretor que captou',
  imobiliaria: 'Número da imobiliária',
}

/**
 * Como a página do imóvel apresenta o contato. Dois eixos independentes — as
 * quatro combinações existem entre os clientes (ver a spec
 * 2026-09-29-contato-do-imovel-design.md).
 */
export interface ListingContactSettings {
  /** Mostra nome, foto e CRECI de quem captou. Nunca o telefone. */
  showListingBroker: boolean
  whatsappTarget: WhatsappTarget
}

/**
 * O comportamento de antes da 0059, e o default das colunas. Também vale
 * quando a leitura não traz a linha: o site continua como sempre foi, em vez
 * de inventar uma terceira regra para o caso de erro.
 */
export const DEFAULT_LISTING_CONTACT: ListingContactSettings = {
  showListingBroker: false,
  whatsappTarget: 'captador',
}

export function isWhatsappTarget(v: unknown): v is WhatsappTarget {
  return typeof v === 'string' && (WHATSAPP_TARGETS as readonly string[]).includes(v)
}

/**
 * Captador como o site o mostra na página do imóvel. Recorte ainda menor que
 * `PublicBroker`: sem `id` (o visitante não tem o que fazer com ele) e sem
 * `bio`, que foi escrita para a página "Quem somos".
 */
export type ListingBroker = Pick<PublicBroker, 'name' | 'photoUrl' | 'creci'>
