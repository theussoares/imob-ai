/**
 * Clique no botão de WhatsApp do site. Ver
 * docs/superpowers/specs/2026-09-25-clique-whatsapp-design.md.
 *
 * Não é contato: o `wa.me` não diz quem clicou. É o rastro que permite a quem
 * atende casar a mensagem que chegou com o imóvel de onde ela saiu.
 */

/** Para qual número a conversa foi. */
export type WhatsappClickDestination = 'corretor' | 'imobiliaria'

/**
 * Onde, na página, estava o botão.
 *
 * Lista fechada porque o endpoint que grava é público: valor livre seria
 * métrica do cliente escrita por qualquer visitante — o mesmo motivo de
 * `LeadSource`.
 */
export type WhatsappClickOrigin = 'imovel' | 'card' | 'barra_fixa' | 'site'

export const WHATSAPP_CLICK_ORIGINS: WhatsappClickOrigin[] = ['imovel', 'card', 'barra_fixa', 'site']

export const WHATSAPP_CLICK_ORIGIN_LABELS: Record<WhatsappClickOrigin, string> = {
  imovel: 'Página do imóvel',
  card: 'Card do catálogo',
  barra_fixa: 'Barra fixa',
  site: 'Cabeçalho/rodapé',
}

/** Normaliza a origem vinda do navegador. Valor estranho cai em `site`. */
export function toWhatsappClickOrigin(value: unknown): WhatsappClickOrigin {
  return WHATSAPP_CLICK_ORIGINS.includes(value as WhatsappClickOrigin) ? (value as WhatsappClickOrigin) : 'site'
}

/** O que o navegador manda. Nada de destino: quem decide é o servidor. */
export interface WhatsappClickInput {
  propertyCode?: string | null
  origin?: string
}

/** Um clique, como o painel mostra. */
export interface WhatsappClick {
  id: string
  createdAt: string
  destination: WhatsappClickDestination
  origin: WhatsappClickOrigin
  property: {
    id: string
    code: string
    title: string
    purpose: 'venda' | 'aluguel'
  } | null
  broker: { id: string; name: string } | null
  /** Lead criado a partir deste clique no painel. */
  leadId: string | null
}
