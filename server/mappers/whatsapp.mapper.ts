import type { Database } from '~~/shared/types/database.types'
import type {
  WhatsappConversation,
  WhatsappDirection,
  WhatsappHistoryMode,
  WhatsappHistoryStatus,
  WhatsappMessage,
  WhatsappMediaStatus,
  WhatsappMessageStatus,
  WhatsappOrigin,
} from '~~/shared/models/whatsapp'

type Tables = Database['public']['Tables']
type AccountRow = Tables['whatsapp_accounts']['Row']
type ConversationRow = Tables['whatsapp_conversations']['Row']
type MessageRow = Tables['whatsapp_messages']['Row']

/**
 * Número conectado, do ponto de vista do SERVIDOR. Carrega o token cifrado,
 * por isso não mora em `shared/models`: nenhum endpoint devolve isto — o
 * painel recebe `WhatsappAccountInfo`.
 */
export interface WhatsappAccountRecord {
  id: string
  tenantId: string
  phoneNumberId: string
  wabaId: string
  displayPhone: string | null
  verifiedName: string | null
  accessTokenEnc: string | null
  ativo: boolean
  coexistencia: boolean
  connectedAt: string | null
  historyMode: WhatsappHistoryMode | null
  historyStatus: WhatsappHistoryStatus | null
  historyRequestedAt: string | null
}

export function toWhatsappAccountRecord(row: AccountRow): WhatsappAccountRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    phoneNumberId: row.phone_number_id,
    wabaId: row.waba_id,
    displayPhone: row.display_phone,
    verifiedName: row.verified_name,
    accessTokenEnc: row.access_token_enc,
    ativo: row.status === 'ativo',
    coexistencia: row.coexistence,
    connectedAt: row.connected_at,
    historyMode: (row.history_mode as WhatsappHistoryMode | null) ?? null,
    historyStatus: (row.history_status as WhatsappHistoryStatus | null) ?? null,
    historyRequestedAt: row.history_requested_at,
  }
}

export type ConversationEmbeds = {
  leads?: { name: string | null; stage: string | null; broker_id: string | null; brokers?: { name: string | null } | null } | null
  properties?: { code: string | null; title: string | null } | null
}

export function toWhatsappConversationModel(row: ConversationRow & ConversationEmbeds): WhatsappConversation {
  return {
    id: row.id,
    waId: row.wa_id,
    contactName: row.contact_name,
    leadId: row.lead_id,
    leadName: row.leads?.name ?? null,
    leadStage: row.leads?.stage ?? null,
    brokerId: row.leads?.broker_id ?? null,
    brokerName: row.leads?.brokers?.name ?? null,
    propertyId: row.property_id,
    propertyCode: row.properties?.code ?? null,
    propertyTitle: row.properties?.title ?? null,
    lastInboundAt: row.last_inbound_at,
    lastMessageAt: row.last_message_at,
    lastMessagePreview: row.last_message_preview,
    lastDirection: (row.last_direction as WhatsappDirection | null) ?? null,
    firstResponseAt: row.first_response_at,
    unreadCount: row.unread_count,
    createdAt: row.created_at,
  }
}

export function toWhatsappMessageModel(row: MessageRow): WhatsappMessage {
  return {
    id: row.id,
    direction: row.direction as WhatsappDirection,
    origin: row.origin as WhatsappOrigin,
    type: row.type,
    body: row.body,
    status: row.status as WhatsappMessageStatus,
    error: row.error,
    occurredAt: row.occurred_at,
    mediaStatus: (row.media_status as WhatsappMediaStatus | null) ?? null,
    mediaMime: row.media_mime,
    mediaFilename: row.media_filename,
    imported: row.imported,
  }
}
