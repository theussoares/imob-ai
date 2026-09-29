import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~~/shared/types/database.types'
import type {
  WhatsappConversation,
  WhatsappDirection,
  WhatsappFiltro,
  WhatsappHistoryMode,
  WhatsappHistoryStatus,
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

const ACCOUNT_COLUMNS =
  'id, tenant_id, phone_number_id, waba_id, display_phone, verified_name, access_token_enc, status, provider, created_at, created_by, updated_at, coexistence, connected_at, history_mode, history_status, history_requested_at, history_consent_by, history_consent_at'

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
  /** Número do app WhatsApp Business (Embedded Signup com Coexistence). */
  coexistencia?: boolean
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
    coexistence: args.coexistencia ?? false,
    // Reconectar recomeça o prazo de 24h do histórico e esquece o pedido
    // anterior: é outra conexão, e a Meta trata assim.
    connected_at: new Date().toISOString(),
    history_mode: null,
    history_status: null,
    history_requested_at: null,
    history_consent_by: null,
    history_consent_at: null,
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
  lastMessageAt: string
  contactName: string | null
  firstResponseAt: string | null
  unreadCount: number
  waId: string
  accountId: string
}

function toState(r: {
  id: string
  lead_id: string | null
  last_inbound_at: string | null
  last_message_at: string
  contact_name: string | null
  first_response_at: string | null
  unread_count: number
  wa_id: string
  account_id: string
}): ConversationState {
  return {
    id: r.id,
    leadId: r.lead_id,
    lastInboundAt: r.last_inbound_at,
    lastMessageAt: r.last_message_at,
    contactName: r.contact_name,
    firstResponseAt: r.first_response_at,
    unreadCount: r.unread_count,
    waId: r.wa_id,
    accountId: r.account_id,
  }
}

const STATE_COLUMNS = 'id, lead_id, last_inbound_at, last_message_at, contact_name, first_response_at, unread_count, wa_id, account_id'

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

/**
 * A conversa deste contato, aceitando as duas formas do número (com e sem o
 * nono dígito). A Meta pode mandar o mesmo celular de um jeito no webhook e
 * de outro na resposta de envio; procurar só pela forma exata abriria duas
 * conversas para a mesma pessoa, com o histórico partido ao meio.
 */
export async function findConversationByWaIds(
  service: Client,
  tenantId: string,
  accountId: string,
  waIds: string[],
): Promise<ConversationState | null> {
  if (!waIds.length) return null
  const { data, error } = await service
    .from('whatsapp_conversations')
    .select(STATE_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('account_id', accountId)
    .in('wa_id', waIds)
    .order('last_message_at', { ascending: false })
    .limit(1)
  if (error) throw error
  const row = data?.[0]
  return row ? toState(row) : null
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

/**
 * Retenção: conversa sem lead parada há mais do prazo some, com as mensagens
 * (cascade) — e com os ARQUIVOS, que o cascade não alcança: objeto no Storage
 * não é linha com FK. Sem apagar os arquivos antes, a foto ficaria no bucket
 * para sempre, depois de a política prometer que sumiu.
 *
 * Pela PASTA da conversa, e não pela coluna `media_path`: a pasta pega também
 * o arquivo que subiu e nunca virou mensagem (upload do painel cujo envio
 * não aconteceu, ou gravação do caminho que falhou — achado da revisão de
 * 29/09). A coluna só conhece o que deu certo.
 *
 * Arquivo antes da linha: se a remoção falhar, a linha fica e o cron de
 * amanhã tenta de novo. Ao contrário, a pasta ficaria sem nada que a lembre.
 */
export async function purgeOrphanConversations(service: Client, antesDe: string): Promise<void> {
  const { data: conversas, error: e1 } = await service
    .from('whatsapp_conversations')
    .select('id, tenant_id')
    .is('lead_id', null)
    .lt('last_message_at', antesDe)
    .limit(200)
  if (e1) throw e1
  if (!conversas?.length) return

  const bucket = service.storage.from('whatsapp-media')
  for (const c of conversas) {
    const pasta = `${c.tenant_id}/${c.id}`
    const PAGINA = 1000
    const caminhos: string[] = []
    for (let offset = 0; ; offset += PAGINA) {
      const { data, error } = await bucket.list(pasta, { limit: PAGINA, offset })
      if (error) throw error
      for (const o of data ?? []) caminhos.push(`${pasta}/${o.name}`)
      if ((data?.length ?? 0) < PAGINA) break
    }
    for (let i = 0; i < caminhos.length; i += 100) {
      const { error } = await bucket.remove(caminhos.slice(i, i + 100))
      if (error) throw error
    }
  }

  const { error } = await service.from('whatsapp_conversations').delete().in('id', conversas.map((c) => c.id))
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Mensagem
// ---------------------------------------------------------------------------

/** Registra o aceite e o pedido do histórico. */
export async function markHistoryRequested(
  service: Client,
  tenantId: string,
  accountId: string,
  a: { mode: WhatsappHistoryMode; userId: string; status: WhatsappHistoryStatus },
): Promise<void> {
  const agora = new Date().toISOString()
  const { error } = await service
    .from('whatsapp_accounts')
    .update({ history_mode: a.mode, history_status: a.status, history_requested_at: agora, history_consent_by: a.userId, history_consent_at: agora })
    .eq('tenant_id', tenantId)
    .eq('id', accountId)
  if (error) throw error
}

export async function setHistoryStatus(service: Client, tenantId: string, accountId: string, status: WhatsappHistoryStatus): Promise<void> {
  const { error } = await service.from('whatsapp_accounts').update({ history_status: status }).eq('tenant_id', tenantId).eq('id', accountId)
  if (error) throw error
}

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
  /** Veio do histórico do Coexistence. */
  imported?: boolean
  /**
   * Recebida: `id` da Meta e o arquivo ainda a baixar (`pendente`).
   * Enviada pelo painel: já está no bucket (`path`), sem id da Meta.
   */
  media?: { id: string | null; mime: string | null; filename: string | null; path?: string; size?: number } | null
}

/**
 * Grava a mensagem e devolve o id. `null` quando ela JÁ existia (mesmo
 * `wamid`): é o reenvio da Meta, e quem chama não deve contar não lida, criar
 * lead, baixar mídia nem avisar de novo.
 */
export async function insertMessage(service: Client, tenantId: string, a: InsertMessageArgs): Promise<string | null> {
  const { data, error } = await service.from('whatsapp_messages').insert({
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
    media_id: a.media?.id ?? null,
    media_mime: a.media?.mime ?? null,
    media_filename: a.media?.filename ?? null,
    media_path: a.media?.path ?? null,
    media_size: a.media?.size ?? null,
    media_status: a.media ? (a.media.path ? 'salva' : 'pendente') : null,
    imported: a.imported ?? false,
  }).select('id').single()
  if (!error) return data.id
  if ((error as { code?: string }).code === '23505') return null
  throw error
}

export interface MediaRef {
  messageId: string
  conversationId: string
  mediaId: string | null
  mime: string | null
  status: string | null
  path: string | null
  filename: string | null
}

/** A mídia de uma mensagem, pelo client do membro (RLS) — para abrir no painel. */
export async function getMessageMedia(client: Client, tenantId: string, messageId: string): Promise<MediaRef | null> {
  const { data, error } = await client
    .from('whatsapp_messages')
    .select('id, conversation_id, media_id, media_mime, media_status, media_path, media_filename')
    .eq('tenant_id', tenantId)
    .eq('id', messageId)
    .maybeSingle()
  if (error) throw error
  // Enviada pelo painel não tem id da Meta, mas tem o arquivo.
  if (!data || (!data.media_id && !data.media_path)) return null
  return {
    messageId: data.id,
    conversationId: data.conversation_id,
    mediaId: data.media_id,
    mime: data.media_mime,
    status: data.media_status,
    path: data.media_path,
    filename: data.media_filename,
  }
}

export async function updateMessageMedia(
  service: Client,
  tenantId: string,
  messageId: string,
  patch: { media_status: string; media_path?: string; media_size?: number; media_mime?: string },
): Promise<void> {
  const { error } = await service.from('whatsapp_messages').update(patch).eq('tenant_id', tenantId).eq('id', messageId)
  if (error) throw error
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
    .select('id, direction, origin, type, body, status, error, occurred_at, tenant_id, conversation_id, wamid, sent_by, created_at, media_id, media_mime, media_filename, media_path, media_size, media_status, imported')
    .eq('tenant_id', tenantId)
    .eq('conversation_id', conversationId)
    .order('occurred_at', { ascending: false })
    .limit(300)
  if (error) throw error
  // Busca as 300 MAIS RECENTES e devolve em ordem de leitura.
  return (data ?? []).map(toWhatsappMessageModel).reverse()
}
