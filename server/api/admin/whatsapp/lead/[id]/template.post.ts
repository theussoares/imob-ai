import type { WhatsappTemplateSendInput } from '~~/shared/models/whatsapp'
import { isValidBrPhone, onlyDigits } from '~~/shared/utils/phone'
import { updateConversation } from '~~/server/repositories/whatsapp.repository'
import { getLeadContact } from '~~/server/repositories/lead.repository'
import { cloudApi } from '~~/server/services/whatsapp/cloud-api'
import type { Enviada } from '~~/server/services/whatsapp/provider'
import { conexaoDoTenant, erroDoEnvio, modeloParaEnviar, registrarSaida } from '~~/server/utils/whatsapp-envio'
import { conversaDoContato } from '~~/server/utils/whatsapp-inbox'

/**
 * Começa a conversa com um contato que chegou pelo formulário do site e nunca
 * escreveu no WhatsApp. É o caminho que tira o atendimento do celular do
 * corretor desde o primeiro contato: sem isto, ele chamaria pelo `wa.me` do
 * próprio aparelho e a conversa nasceria fora do painel.
 *
 * O telefone sai do LEAD, lido pelo client do membro (RLS + tenant), nunca do
 * body: um número vindo do body faria o painel mandar mensagem, em nome da
 * imobiliária, para quem o membro quisesse.
 */
export default defineEventHandler(async (event) => {
  const { client, tenant, user } = await requireTenantMember(event)
  await exigirWhatsapp(tenant.id)
  const leadId = idDeRota(getRouterParam(event, 'id'))
  const body = await readBody<WhatsappTemplateSendInput>(event)
  assertWhatsappTemplateSend(body)

  const lead = await getLeadContact(client, tenant.id, leadId)
  if (!lead) throw createError({ statusCode: 404, statusMessage: 'Contato não encontrado.' })
  const telefone = onlyDigits(lead.phone)
  if (!isValidBrPhone(telefone)) throw createError({ statusCode: 422, statusMessage: 'O telefone deste contato não é válido.' })

  const service = serviceSupabase()
  const { conta, conexao } = await conexaoDoTenant(service, tenant.id)
  const { modelo, texto } = await modeloParaEnviar(conexao, body, tenant.slug)

  let enviada: Enviada
  try {
    enviada = await cloudApi().enviarModelo(conexao, '55' + telefone, modelo, body.values)
  } catch (e) {
    erroDoEnvio(e, tenant.slug)
  }

  // Depois do envio, pelo wa_id que a Meta resolveu: é por ele que a resposta
  // vai chegar, e a conversa precisa ser a mesma.
  const state = await conversaDoContato(service, conta, enviada.waId || '55' + telefone, lead.name)
  if (!state.leadId) {
    await updateConversation(service, tenant.id, state.id, { lead_id: lead.id })
    state.leadId = lead.id
  }
  await registrarSaida(service, tenant, user.id, state, { wamid: enviada.wamid, type: 'template', body: texto, modelo: modelo.name })
  return { ok: true, conversationId: state.id }
})
