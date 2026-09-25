import type { Database } from '~~/shared/types/database.types'
import type { WhatsappClick, WhatsappClickDestination } from '~~/shared/models/whatsapp-click'
import { toWhatsappClickOrigin } from '~~/shared/models/whatsapp-click'

type ClickRow = Pick<
  Database['public']['Tables']['whatsapp_clicks']['Row'],
  'id' | 'created_at' | 'destination' | 'origin' | 'lead_id'
>

/** Imóvel e corretor embutidos na query do painel. */
export type ClickEmbeds = {
  properties: { id: string; code: string; title: string; purpose: string } | null
  brokers: { id: string; name: string } | null
}

export function toWhatsappClickModel(row: ClickRow, embeds: ClickEmbeds): WhatsappClick {
  const p = embeds.properties
  return {
    id: row.id,
    createdAt: row.created_at,
    // O CHECK da 0046 garante os dois valores.
    destination: row.destination as WhatsappClickDestination,
    origin: toWhatsappClickOrigin(row.origin),
    property: p
      ? { id: p.id, code: p.code, title: p.title, purpose: p.purpose === 'aluguel' ? 'aluguel' : 'venda' }
      : null,
    broker: embeds.brokers ? { id: embeds.brokers.id, name: embeds.brokers.name } : null,
    leadId: row.lead_id,
  }
}
