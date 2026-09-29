import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~~/shared/types/database.types'
import type { Tenant } from '~~/shared/models/tenant'
import { LEAD_TYPE_LABELS, seekingTypeFor } from '~~/shared/models/lead'
import { codigoDoImovelNaMensagem, previa, telefonesDoWaId } from '~~/shared/models/whatsapp'
import { formatPropertyCode } from '~~/shared/utils/property-specs'
import type { WhatsappAccountRecord } from '~~/server/mappers/whatsapp.mapper'
import type { LoteDoWebhook, MensagemEcoada, MensagemRecebida } from '~~/server/services/whatsapp/provider'
import type { MidiaPendente } from '~~/server/utils/whatsapp-midia'
import { registrarContatos, registrarHistorico } from '~~/server/utils/whatsapp-historico'
import {
  ensureConversation,
  findConversationByWaIds,
  incrementUnread,
  insertMessage,
  updateConversation,
  updateMessageStatus,
  type ConversationPatch,
  type ConversationState,
} from '~~/server/repositories/whatsapp.repository'
import { assignLeadBroker, createLead, findOpenLeadByPhones } from '~~/server/repositories/lead.repository'
import { findPropertyByDisplayCode } from '~~/server/repositories/property.repository'
import { findRecentFreeClick, markClickConverted } from '~~/server/repositories/whatsapp-click.repository'
import { getTenantById } from '~~/server/repositories/tenant.repository'
import { getBroker } from '~~/server/repositories/broker.repository'
import { avisarNovoLead } from '~~/server/utils/lead-alert'
import { distribuirPelaRoleta, registrarEventos } from '~~/server/utils/lead-crm'
import { crmAtivo } from '~~/server/utils/entitlement'

type Client = SupabaseClient<Database>

/**
 * O que acontece quando o webhook do WhatsApp traz mensagens de UM número
 * conectado. O tenant já foi provado (`conta` veio do `phone_number_id` de um
 * corpo assinado); daqui para baixo tudo é escopado por `conta.tenantId`.
 *
 * Lança quando a GRAVAÇÃO falha — o webhook responde 500 e a Meta reenvia,
 * que é o que queremos. O que vem depois de gravar (lead, roleta, aviso) não
 * lança: a mensagem já está salva, e um reenvio por causa do e-mail seria
 * ignorado pelo `wamid` de qualquer jeito.
 */
export async function processarLoteWhatsapp(service: Client, conta: WhatsappAccountRecord, lote: LoteDoWebhook): Promise<MidiaPendente[]> {
  const midias: MidiaPendente[] = []
  for (const m of lote.recebidas) {
    const p = await registrarRecebida(service, conta, m)
    if (p) midias.push(p)
  }
  for (const e of lote.ecos) {
    const p = await registrarEco(service, conta, e)
    if (p) midias.push(p)
  }
  for (const s of lote.status) await updateMessageStatus(service, conta.tenantId, s.wamid, s.status, s.erro)
  if (lote.historico?.length) await registrarHistorico(service, conta, lote.historico)
  if (lote.contatos?.length) await registrarContatos(service, conta, lote.contatos)
  // Devolvidas, e não baixadas aqui: o download vem DEPOIS de todas as
  // mensagens gravadas, para uma foto lenta não atrasar o texto que veio junto.
  return midias
}

const midiaDoRegistro = (m: { midia: MensagemRecebida['midia'] }) =>
  m.midia ? { id: m.midia.id, mime: m.midia.mime, filename: m.midia.nomeDoArquivo } : null

async function registrarRecebida(service: Client, conta: WhatsappAccountRecord, m: MensagemRecebida): Promise<MidiaPendente | null> {
  const state = await conversaDoContato(service, conta, m.de, m.nomeDoPerfil)

  const nova = await insertMessage(service, conta.tenantId, {
    conversationId: state.id,
    wamid: m.wamid,
    direction: 'in',
    origin: 'contato',
    type: m.tipo,
    body: m.texto,
    status: 'recebida',
    sentBy: null,
    occurredAt: m.quando,
    media: midiaDoRegistro(m),
  })
  // Reenvio da Meta: a mensagem já foi contada, o lead já existe, o aviso já saiu.
  if (!nova) return null

  const patch: ConversationPatch = {
    last_inbound_at: m.quando,
    last_message_at: m.quando,
    last_message_preview: previa(m.tipo, m.texto),
    last_direction: 'in',
  }
  // A primeira AO VIVO — é daqui que o tempo de primeira resposta conta (0062).
  if (!state.firstInboundAt) patch.first_inbound_at = m.quando
  if (m.nomeDoPerfil) patch.contact_name = m.nomeDoPerfil

  if (!state.leadId) Object.assign(patch, await vincularLead(service, conta.tenantId, state, m))

  await updateConversation(service, conta.tenantId, state.id, patch)
  await incrementUnread(service, conta.tenantId, state.id)
  return m.midia ? { messageId: nova, conversationId: state.id, mediaId: m.midia.id } : null
}

async function registrarEco(service: Client, conta: WhatsappAccountRecord, e: MensagemEcoada): Promise<MidiaPendente | null> {
  const state = await conversaDoContato(service, conta, e.para, null)
  const nova = await insertMessage(service, conta.tenantId, {
    conversationId: state.id,
    wamid: e.wamid,
    direction: 'out',
    origin: 'app',
    type: e.tipo,
    body: e.texto,
    status: 'enviada',
    sentBy: null,
    occurredAt: e.quando,
    media: midiaDoRegistro(e),
  })
  if (!nova) return null
  await updateConversation(service, conta.tenantId, state.id, respostaPatch(state, e.quando, previa(e.tipo, e.texto)))
  return e.midia ? { messageId: nova, conversationId: state.id, mediaId: e.midia.id } : null
}

/**
 * A conversa deste contato neste número, criando se não houver. Procura pelas
 * duas formas do celular antes de criar — ver `findConversationByWaIds`.
 */
export async function conversaDoContato(
  service: Client,
  conta: Pick<WhatsappAccountRecord, 'id' | 'tenantId'>,
  waId: string,
  nome: string | null,
): Promise<ConversationState & { nova: boolean }> {
  const formas = [...new Set([waId, ...telefonesDoWaId(waId).map((t) => '55' + t)])]
  const existente = await findConversationByWaIds(service, conta.tenantId, conta.id, formas)
  if (existente) return { ...existente, nova: false }
  const { state, nova } = await ensureConversation(service, conta.tenantId, conta.id, waId, nome)
  return { ...state, nova }
}

/**
 * O que uma mensagem de SAÍDA muda na conversa — pelo painel ou pelo app.
 *
 * A primeira resposta conta pelos dois caminhos (spec, regra 5): no
 * Coexistence o corretor responde do celular, e contar só o painel faria o
 * dono ver "nunca respondido" em conversa atendida em dois minutos.
 */
export function respostaPatch(
  state: Pick<ConversationState, 'firstResponseAt' | 'firstInboundAt'>,
  quando: string,
  preview: string,
): ConversationPatch {
  const patch: ConversationPatch = {
    last_message_at: quando,
    last_message_preview: preview,
    last_direction: 'out',
    // Quem respondeu leu.
    unread_count: 0,
  }
  // Só depois de uma entrada AO VIVO: mensagem que a imobiliária puxa primeiro
  // não é "resposta", nem a que responde a uma conversa só de histórico.
  if (!state.firstResponseAt && state.firstInboundAt) patch.first_response_at = quando
  return patch
}

/**
 * Liga a conversa a um lead — o que já existe para aquele telefone, ou um
 * novo — e ao imóvel e clique de onde a mensagem veio.
 *
 * Nunca lança: a mensagem já está gravada. Sem lead, a conversa continua na
 * caixa de entrada e dá para vincular depois; perder a mensagem porque a roleta
 * falhou seria trocar o importante pelo acessório.
 */
async function vincularLead(service: Client, tenantId: string, state: ConversationState, m: MensagemRecebida): Promise<ConversationPatch> {
  let tenant: Tenant | null = null
  // Fora do try: o que já foi feito (lead criado) é devolvido mesmo se um passo
  // seguinte falhar — senão a conversa ficaria sem o lead que acabou de nascer.
  const patch: ConversationPatch = {}
  try {
    tenant = await getTenantById(service, tenantId)
    if (!tenant) return {}

    const telefones = telefonesDoWaId(m.de)
    const codigo = codigoDoImovelNaMensagem(m.texto)
    const imovel = codigo ? await findPropertyByDisplayCode(service, tenantId, codigo) : null
    if (imovel) patch.property_id = imovel.id

    const existente = await findOpenLeadByPhones(service, tenantId, telefones)
    if (existente) {
      await registrarEventos(service, tenant, existente.id, [{ kind: 'whatsapp', body: 'Mandou mensagem pelo WhatsApp', meta: {} }], null)
      patch.lead_id = existente.id
      return patch
    }

    const leadId = await createLead(service, {
      tenantId,
      propertyId: imovel?.id ?? null,
      name: (m.nomeDoPerfil || '').trim().slice(0, 120) || 'Contato do WhatsApp',
      phone: telefones[0] ?? m.de,
      ipHash: null,
      message: m.texto ? m.texto.slice(0, 2000) : null,
      // Não há origem `whatsapp` em `leads.source` (spec, "Fora do escopo"): o
      // vínculo que diz de onde veio é `whatsapp_conversations.lead_id`.
      source: 'outro',
      leadType: imovel ? seekingTypeFor(imovel.purpose) : 'indefinido',
    })
    patch.lead_id = leadId
    await registrarEventos(service, tenant, leadId, [{ kind: 'whatsapp', body: 'Conversa iniciada pelo WhatsApp', meta: {} }], null)

    // O clique que provavelmente originou a conversa — janela curta, ver
    // `findRecentFreeClick`. Se o visitante escolheu falar com o corretor
    // captador, o lead vai para ele e não passa pela roleta (0049, regra 4).
    let corretor: { id: string; name: string; email: string | null } | null = null
    if (imovel) {
      const desde = new Date(Date.parse(m.quando) - 2 * 60 * 60 * 1000).toISOString()
      const clique = await findRecentFreeClick(service, tenantId, imovel.id, desde)
      if (clique && (await markClickConverted(service, tenantId, clique.id, leadId))) {
        patch.whatsapp_click_id = clique.id
        if (clique.brokerId) {
          const b = await getBroker(service, tenantId, clique.brokerId)
          if (b) {
            await assignLeadBroker(service, tenantId, leadId, b.id)
            corretor = { id: b.id, name: b.name, email: b.email }
          }
        }
      }
    }
    if (!corretor && (await crmAtivo(tenantId))) corretor = await distribuirPelaRoleta(service, tenant, leadId)

    await avisarNovoLead(
      tenant,
      {
        nome: m.nomeDoPerfil || 'Contato do WhatsApp',
        telefone: telefones[0] ?? m.de,
        mensagem: m.texto,
        tipo: LEAD_TYPE_LABELS[imovel ? seekingTypeFor(imovel.purpose) : 'indefinido'],
        imovel: imovel ? { codigo: formatPropertyCode(imovel.code), titulo: imovel.title } : null,
      },
      corretor?.email ? [corretor.email] : [],
    )
    return patch
  } catch (e) {
    // Sem telefone nem texto no log: dado pessoal de terceiro (ver log.ts).
    logError('whatsapp.lead_nao_vinculado', { tenant: tenant?.slug ?? tenantId, conversa: state.id, reason: errMessage(e) })
    return patch
  }
}
