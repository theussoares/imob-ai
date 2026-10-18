import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~~/shared/types/database.types'
import { previa, telefonesDoWaId } from '~~/shared/models/whatsapp'
import type { WhatsappAccountRecord } from '~~/server/mappers/whatsapp.mapper'
import type { ContatoDaAgenda, PedacoDoHistorico } from '~~/server/services/whatsapp/provider'
import { findConversationByWaIds, insertMessage, setHistoryStatus, updateConversation, type ConversationPatch } from '~~/server/repositories/whatsapp.repository'
import { findAnyLeadByPhones } from '~~/server/repositories/lead.repository'
import { conversaDoContato } from '~~/server/utils/whatsapp-inbox'

type Client = SupabaseClient<Database>

/**
 * Grava o histórico do app (Coexistence) que a Meta mandou por webhook.
 *
 * Três regras, e as três são LGPD antes de serem produto:
 *
 * 1. **Sem pedido registrado, nada entra.** A Meta só manda o histórico se
 *    alguém pediu, mas o webhook é público e o `history_mode` é o aceite do
 *    owner: sem ele, o pedaço é descartado.
 * 2. **Histórico não cria lead, nem avisa, nem passa pela roleta.** São
 *    conversas de até 6 meses atrás, muitas pessoais; virar card no funil e
 *    e-mail para o corretor seria transformar a agenda do celular em lista de
 *    prospecção.
 * 3. **`so_leads` pula quem não é contato.** Nem a conversa é criada.
 *
 * Mensagem de histórico não conta como não lida nem como "primeira resposta":
 * é passado, não atendimento a fazer nem feito agora.
 */
export async function registrarHistorico(service: Client, conta: WhatsappAccountRecord, pedacos: PedacoDoHistorico[]): Promise<void> {
  if (!conta.historyMode) {
    logWarn('whatsapp.historico_sem_pedido', { tenant: conta.tenantId })
    return
  }
  for (const pedaco of pedacos) {
    if (pedaco.recusado) {
      await setHistoryStatus(service, conta.tenantId, conta.id, 'recusado')
      continue
    }
    for (const c of pedaco.conversas) await registrarConversa(service, conta, c)
    const status = pedaco.progresso === 100 ? 'concluido' : 'recebendo'
    if (conta.historyStatus !== status) {
      await setHistoryStatus(service, conta.tenantId, conta.id, status)
      conta.historyStatus = status
    }
  }
}

async function registrarConversa(
  service: Client,
  conta: WhatsappAccountRecord,
  c: PedacoDoHistorico['conversas'][number],
): Promise<void> {
  if (!c.mensagens.length) return
  // Só lead que já existia ANTES da conexão: um criado depois (o formulário
  // público aceita qualquer telefone) faria uma conversa pessoal passar pelo
  // modo "só contatos" — achado da revisão de 29/09.
  const leadId = await findAnyLeadByPhones(service, conta.tenantId, telefonesDoWaId(c.waId), conta.connectedAt)
  if (conta.historyMode === 'so_leads' && !leadId) return

  const state = await conversaDoContato(service, conta, c.waId, null)
  let ultima: (typeof c.mensagens)[number] | null = null
  let ultimaEntrada: string | null = null
  for (const m of c.mensagens) {
    const nova = await insertMessage(service, conta.tenantId, {
      conversationId: state.id,
      wamid: m.wamid,
      direction: m.doContato ? 'in' : 'out',
      origin: m.doContato ? 'contato' : 'app',
      type: m.tipo,
      body: m.texto,
      status: m.doContato ? 'recebida' : 'enviada',
      sentBy: null,
      occurredAt: m.quando,
      imported: true,
      // A mídia fica 'pendente' e é baixada se alguém abrir — baixar meses de
      // fotos no webhook estouraria o tempo e o bucket com o que ninguém vai ver.
      media: m.midia ? { id: m.midia.id, mime: m.midia.mime, filename: m.midia.nomeDoArquivo } : null,
    })
    if (!nova) continue
    if (!ultima || depois(m.quando, ultima.quando)) ultima = m
    if (m.doContato && (!ultimaEntrada || depois(m.quando, ultimaEntrada))) ultimaEntrada = m.quando
  }

  const patch: ConversationPatch = {}
  if (leadId && !state.leadId) patch.lead_id = leadId
  // Conversa que o histórico acabou de criar nasce com `last_message_at =
  // now()` (default da 0059): a data certa é a da última mensagem, sempre —
  // senão a retenção de 90 dias contaria da importação, e não da conversa.
  // Conversa que já existia: só avança, porque pode ter mensagem ao vivo mais
  // nova que o histórico.
  if (ultima && (state.nova || depois(ultima.quando, state.lastMessageAt))) {
    patch.last_message_at = ultima.quando
    patch.last_message_preview = previa(ultima.tipo, ultima.texto)
    patch.last_direction = ultima.doContato ? 'in' : 'out'
  }
  if (ultimaEntrada && (!state.lastInboundAt || depois(ultimaEntrada, state.lastInboundAt))) patch.last_inbound_at = ultimaEntrada
  if (Object.keys(patch).length) await updateConversation(service, conta.tenantId, state.id, patch)
}

/**
 * `a` é depois de `b`? Por data, não por texto: o Postgres devolve
 * "…+00:00" e o `toISOString` escreve "…Z" — comparar as strings erra.
 */
function depois(a: string, b: string): boolean {
  return Date.parse(a) > Date.parse(b)
}

/**
 * Nomes da agenda do app, SÓ para conversas que já existem e estão sem nome.
 * Nenhum contato da agenda vira linha: a agenda do celular inteira não é dado
 * de que a imobiliária precise no painel.
 */
export async function registrarContatos(service: Client, conta: WhatsappAccountRecord, contatos: ContatoDaAgenda[]): Promise<void> {
  if (!conta.historyMode) return
  for (const ct of contatos) {
    const formas = [...new Set([ct.waId, ...telefonesDoWaId(ct.waId).map((t) => '55' + t)])]
    const conversa = await findConversationByWaIds(service, conta.tenantId, conta.id, formas)
    if (conversa && !conversa.contactName) await updateConversation(service, conta.tenantId, conversa.id, { contact_name: ct.nome })
  }
}
