import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~~/shared/types/database.types'
import type {
  WhatsappConversation,
  WhatsappDirection,
  WhatsappFiltro,
  WhatsappMessage,
  WhatsappMessageStatus,
  WhatsappOrigin,
} from '~~/shared/models/whatsapp'
import {
  toWhatsappAccountRecord,
  toWhatsappConversationModel,
  toWhatsappMessageModel,
  type WhatsappAccountRecord,
} from '~~/server/mappers/whatsapp.mapper'

type Client = SupabaseClient<Database>

/**
 * Acesso às conversas do WhatsApp (0059).
 *
 * Toda ESCRITA aqui recebe a service_role — as três tabelas não aceitam escrita
 * de `authenticated` — e por isso o `tenant_id` no filtro é a única trava
 * (invariante nº 2). As LEITURAS do painel recebem o client do membro: a RLS
 * é a segunda trava, de graça.
 */

// ---------------------------------------------------------------------------
// Número conectado
// ---------------------------------------------------------------------------

const ACCOUNT_COLUMNS = 'id, tenant_id, phone_number_id, waba_id, display_phone, verified_name, access_token_enc, status, provider, created_at, created_by, updated_at'

/**
 * De quem é este número? A ÚNICA leitura sem `tenant_id` do arquivo, e é de
 * propósito: é assim que o webhook DESCOBRE o tenant. O `phone_number_id` veio
 * num corpo cuja assinatura já foi conferida, e é unique global (0059).
 */
export async function getAccountByPhoneNumberId(service: Client, phoneNumberId: string): Promise<WhatsappAccountRecord | null> {
  const { data, error } = await service
    .from('whatsapp_accounts')
    .select(ACCOUNT_COLUMNS)
    .eq('phone_number_id', phoneNumberId)
    .maybeSingle()
  if (error) throw error
  return data ? toWhatsappAccountRecord(data) : null
}

/** O número ativo da imobiliária (um por tenant no F0). */
export async function getActiveAccount(service: Client, tenantId: string): Promise<WhatsappAccountRecord | null> {
  const { data, error } = await service
    .from('whatsapp_accounts')
    .select(ACCOUNT_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('status', 'ativo')
    .order('created_at', { ascending: false })
    .limit(1)
  if (error) throw error
  const row = data?.[0]
  return row ? toWhatsappAccountRecord(row) : null
}

export async function getAccountById(service: Client, tenantId: string, id: string): Promise<WhatsappAccountRecord | null> {
  const { data, error } = await service
    .from('whatsapp_accounts')
    .select(ACCOUNT_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data ? toWhatsappAccountRecord(data) : null
}

export interface SaveAccountArgs {
  phoneNumberId: string
  wabaId: string
  displayPhone: string | null
  verifiedName: string | null
  accessTokenEnc: string
  userId: string
}

/**
 * Conecta (ou reconecta) um número.
 *
 * Um número que JÁ pertence a outro tenant é recusado aqui, e não deixado para
 * o unique estourar: o upsert por `phone_number_id` trocaria o `tenant_id` da
 * linha, e as mensagens seguintes daquele número passariam a cair no painel de
 * quem colou o id — bastaria conhecer o id de outra imobiliária.
 */
export async function saveAccount(service: Client, tenantId: string, args: SaveAccountArgs): Promise<'ok' | 'de_outro_tenant'> {
  const existente = await getAccountByPhoneNumberId(service, args.phoneNumberId)
  if (existente && existente.tenantId !== tenantId) return 'de_outro_tenant'

  // Um número ativo por imobiliária no F0: conectar outro desliga o anterior.
  const { error: e1 } = await service
    .from('whatsapp_accounts')
    .update({ status: 'desconectado' })
    .eq('tenant_id', tenantId)
    .neq('phone_number_id', args.phoneNumberId)
  if (e1) throw e1

  const campos = {
    waba_id: args.wabaId,
    display_phone: args.displayPhone,
    verified_name: args.verifiedName,
    access_token_enc: args.accessTokenEnc,
    status: 'ativo',
  }
  if (existente) {
    const { error } = await service.from('whatsapp_accounts').update(campos).eq('tenant_id', tenantId).eq('id', existente.id)
    if (error) throw error
  } else {
    const { error } = await service
      .from('whatsapp_accounts')
      .insert({ ...campos, tenant_id: tenantId, phone_number_id: args.phoneNumberId, created_by: args.userId })
    if (error) throw error
  }
  return 'ok'
}

/**
 * Desconecta: apaga o token, mantém a linha. As conversas continuam
 * legíveis (histórico é o motivo do recurso), só não entra nem sai mais nada.
 */
export async function disconnectAccount(service: Client, tenantId: string): Promise<void> {
  const { error } = await service
    .from('whatsapp_accounts')
    .update({ status: 'desconectado', access_token_enc: null })
    .eq('tenant_id', tenantId)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Conversa
// ---------------------------------------------------------------------------

export interface ConversationState {
  id: string
  leadId: string | null
  lastInboundAt: string | null
  firstResponseAt: string | null
  unreadCount: number
  waId: string
  accountId: string
}

function toState(r: {
  id: string
  lead_id: string | null
  last_inbound_at: string | null
  first_response_at: string | null
  unread_count: number
  wa_id: string
  account_id: string
}): ConversationState {
  return {
    id: r.id,
    leadId: r.lead_id,
    lastInboundAt: r.last_inbound_at,
    firstResponseAt: r.first_response_at,
    unreadCount: r.unread_count,
    waId: r.wa_id,
    accountId: r.account_id,
  }
}

const STATE_COLUMNS = 'id, lead_id, last_inbound_at, first_response_at, unread_count, wa_id, account_id'

export async function findConversation(service: Client, tenantId: string, accountId: string, waId: string): Promise<ConversationState | null> {
  const { data, error } = await service
    .from('whatsapp_conversations')
    .select(STATE_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('account_id', accountId)
    .eq('wa_id', waId)
    .maybeSingle()
  if (error) throw error
  return data ? toState(data) : null
}

export async function getConversationState(client: Client, tenantId: string, id: string): Promise<ConversationState | null> {
  const { data, error } = await client
    .from('whatsapp_conversations')
    .select(STATE_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data ? toState(data) : null
}

/**
 * Cria a conversa, ou devolve a que já existe.
 *
 * `ignoreDuplicates` + releitura, e não "procura, e se não achou insere": a
 * Meta manda duas mensagens seguidas do mesmo contato em webhooks paralelos, e
 * entre a procura e o insert as duas passariam — o unique recusaria a segunda
 * e a mensagem dela se perderia.
 */
export async function ensureConversation(
  service: Client,
  tenantId: string,
  accountId: string,
  waId: string,
  contactName: string | null,
): Promise<{ state: ConversationState; nova: boolean }> {
  const { data, error } = await service
    .from('whatsapp_conversations')
    .upsert(
      { tenant_id: tenantId, account_id: accountId, wa_id: waId, contact_name: contactName },
      { onConflict: 'account_id,wa_id', ignoreDuplicates: true },
    )
    .select(STATE_COLUMNS)
  if (error) throw error
  const criada = data?.[0]
  if (criada) return { state: toState(criada), nova: true }

  const existente = await findConversation(service, tenantId, accountId, waId)
  if (!existente) throw new Error('whatsapp: conversa sumiu entre o upsert e a releitura')
  return { state: existente, nova: false }
}

export type ConversationPatch = Partial<{
  contact_name: string | null
  lead_id: string | null
  property_id: string | null
  whatsapp_click_id: string | null
  last_inbound_at: string
  last_message_at: string
  last_message_preview: string
  last_direction: WhatsappDirection
  first_response_at: string
  unread_count: number
}>

export async function updateConversation(service: Client, tenantId: string, id: string, patch: ConversationPatch): Promise<void> {
  const { error } = await service.from('whatsapp_conversations').update(patch).eq('tenant_id', tenantId).eq('id', id)
  if (error) throw error
}

/**
 * Conta não lida SEM ler-e-gravar: duas mensagens simultâneas leriam o mesmo 3
 * e gravariam 4. A função soma no banco.
 */
export async function incrementUnread(service: Client, tenantId: string, id: string): Promise<void> {
  const { error } = await service.rpc('whatsapp_conversa_nao_lida', { p_tenant_id: tenantId, p_conversation_id: id })
  if (error) throw error
}

export async function listConversations(
  client: Client,
  tenantId: string,
  filtro: WhatsappFiltro,
  brokerId: string | null,
): Promise<WhatsappConversation[]> {
  let q = client
    .from('whatsapp_conversations')
    .select('*, leads(name, stage, broker_id, brokers(name)), properties(code, title)')
    .eq('tenant_id', tenantId)
  if (filtro === 'sem_resposta') q = q.eq('last_direction', 'in')
  if (filtro === 'nao_lidas') q = q.gt('unread_count', 0)
  const { data, error } = await q.order('last_message_at', { ascending: false }).limit(200)
  if (error) throw error
  const lista = (data ?? []).map((r) => toWhatsappConversationModel(r))
  // Pelo corretor do LEAD: é ele quem atende, e a conversa não tem dono próprio
  // (corretor não loga — CLAUDE.md, "Papéis").
  return brokerId ? lista.filter((c) => c.brokerId === brokerId) : lista
}

export async function getConversation(client: Client, tenantId: string, id: string): Promise<WhatsappConversation | null> {
  const { data, error } = await client
    .from('whatsapp_conversations')
    .select('*, leads(name, stage, broker_id, brokers(name)), properties(code, title)')
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data ? toWhatsappConversationModel(data) : null
}

/** A conversa deste lead, para o atalho na ficha do contato. */
export async function getConversationIdByLead(client: Client, tenantId: string, leadId: string): Promise<string | null> {
  const { data, error } = await client
    .from('whatsapp_conversations')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('lead_id', leadId)
    .order('last_message_at', { ascending: false })
    .limit(1)
  if (error) throw error
  return data?.[0]?.id ?? null
}

/** Retenção: conversa sem lead parada há mais do prazo some, com as mensagens (cascade). */
export async function purgeOrphanConversations(service: Client, antesDe: string): Promise<void> {
  const { error } = await service
    .from('whatsapp_conversations')
    .delete()
    .is('lead_id', null)
    .lt('last_message_at', antesDe)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Mensagem
// ---------------------------------------------------------------------------

export interface InsertMessageArgs {
  conversationId: string
  wamid: string | null
  direction: WhatsappDirection
  origin: WhatsappOrigin
  type: string
  body: string | null
  status: WhatsappMessageStatus
  sentBy: string | null
  occurredAt: string
}

/**
 * Grava a mensagem. `false` quando ela JÁ existia (mesmo `wamid`): é o
 * reenvio da Meta, e quem chama não deve contar não lida, criar lead nem
 * avisar de novo.
 */
export async function insertMessage(service: Client, tenantId: string, a: InsertMessageArgs): Promise<boolean> {
  const { error } = await service.from('whatsapp_messages').insert({
    tenant_id: tenantId,
    conversation_id: a.conversationId,
    wamid: a.wamid,
    direction: a.direction,
    origin: a.origin,
    type: a.type,
    body: a.body,
    status: a.status,
    sent_by: a.sentBy,
    occurred_at: a.occurredAt,
  })
  if (!error) return true
  if ((error as { code?: string }).code === '23505') return false
  throw error
}

/** Estados que um status NOVO pode sobrescrever — o status nunca volta. */
const ANTERIORES: Record<WhatsappMessageStatus, WhatsappMessageStatus[]> = {
  recebida: [],
  enviada: ['recebida'],
  entregue: ['recebida', 'enviada'],
  lida: ['recebida', 'enviada', 'entregue'],
  falhou: ['recebida', 'enviada', 'entregue'],
}

/**
 * Atualiza o status de entrega. A condição `in (anteriores)` é a trava: o
 * "lida" que chega antes do "entregue" (a Meta não garante ordem) não é
 * desfeito por ele.
 */
export async function updateMessageStatus(
  service: Client,
  tenantId: string,
  wamid: string,
  status: WhatsappMessageStatus,
  erro: string | null,
): Promise<void> {
  const anteriores = ANTERIORES[status]
  if (!anteriores.length) return
  const { error } = await service
    .from('whatsapp_messages')
    .update(erro ? { status, error: erro } : { status })
    .eq('tenant_id', tenantId)
    .eq('wamid', wamid)
    .in('status', anteriores)
  if (error) throw error
}

export async function listMessages(client: Client, tenantId: string, conversationId: string): Promise<WhatsappMessage[]> {
  const { data, error } = await client
    .from('whatsapp_messages')
    .select('id, direction, origin, type, body, status, error, occurred_at, tenant_id, conversation_id, wamid, sent_by, created_at')
    .eq('tenant_id', tenantId)
    .eq('conversation_id', conversationId)
    .order('occurred_at', { ascending: false })
    .limit(300)
  if (error) throw error
  // Busca as 300 MAIS RECENTES e devolve em ordem de leitura.
  return (data ?? []).map(toWhatsappMessageModel).reverse()
}
