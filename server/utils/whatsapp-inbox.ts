import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~~/shared/types/database.types'
import type { Tenant } from '~~/shared/models/tenant'
import { LEAD_TYPE_LABELS, seekingTypeFor } from '~~/shared/models/lead'
import { codigoDoImovelNaMensagem, previa, telefonesDoWaId } from '~~/shared/models/whatsapp'
import { formatPropertyCode } from '~~/shared/utils/property-specs'
import type { WhatsappAccountRecord } from '~~/server/mappers/whatsapp.mapper'
import type { LoteDoWebhook, MensagemEcoada, MensagemRecebida } from '~~/server/services/whatsapp/provider'
import {
  ensureConversation,
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
export async function processarLoteWhatsapp(service: Client, conta: WhatsappAccountRecord, lote: LoteDoWebhook): Promise<void> {
  for (const m of lote.recebidas) await registrarRecebida(service, conta, m)
  for (const e of lote.ecos) await registrarEco(service, conta, e)
  for (const s of lote.status) await updateMessageStatus(service, conta.tenantId, s.wamid, s.status, s.erro)
}

async function registrarRecebida(service: Client, conta: WhatsappAccountRecord, m: MensagemRecebida): Promise<void> {
  const { state } = await ensureConversation(service, conta.tenantId, conta.id, m.de, m.nomeDoPerfil)

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
  })
  // Reenvio da Meta: a mensagem já foi contada, o lead já existe, o aviso já saiu.
  if (!nova) return

  const patch: ConversationPatch = {
    last_inbound_at: m.quando,
    last_message_at: m.quando,
    last_message_preview: previa(m.tipo, m.texto),
    last_direction: 'in',
  }
  if (m.nomeDoPerfil) patch.contact_name = m.nomeDoPerfil

  if (!state.leadId) Object.assign(patch, await vincularLead(service, conta.tenantId, state, m))

  await updateConversation(service, conta.tenantId, state.id, patch)
  await incrementUnread(service, conta.tenantId, state.id)
}

async function registrarEco(service: Client, conta: WhatsappAccountRecord, e: MensagemEcoada): Promise<void> {
  const { state } = await ensureConversation(service, conta.tenantId, conta.id, e.para, null)
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
  })
  if (!nova) return
  await updateConversation(service, conta.tenantId, state.id, respostaPatch(state, e.quando, previa(e.tipo, e.texto)))
}

/**
 * O que uma mensagem de SAÍDA muda na conversa — pelo painel ou pelo app.
 *
 * A primeira resposta conta pelos dois caminhos (spec, regra 5): no
 * Coexistence o corretor responde do celular, e contar só o painel faria o
 * dono ver "nunca respondido" em conversa atendida em dois minutos.
 */
export function respostaPatch(state: Pick<ConversationState, 'firstResponseAt' | 'lastInboundAt'>, quando: string, preview: string): ConversationPatch {
  const patch: ConversationPatch = {
    last_message_at: quando,
    last_message_preview: preview,
    last_direction: 'out',
    // Quem respondeu leu.
    unread_count: 0,
  }
  // Só depois de uma entrada: mensagem que a imobiliária puxa primeiro não é "resposta".
  if (!state.firstResponseAt && state.lastInboundAt) patch.first_response_at = quando
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
