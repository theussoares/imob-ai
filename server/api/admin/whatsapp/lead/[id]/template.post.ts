import type { WhatsappTemplateSendInput } from '~~/shared/models/whatsapp'
import { isValidBrPhone, onlyDigits } from '~~/shared/utils/phone'
import { getLeadContact } from '~~/server/repositories/lead.repository'
import { iniciarConversaComModelo } from '~~/server/utils/whatsapp-envio'

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

  const conversationId = await iniciarConversaComModelo(serviceSupabase(), tenant, user.id, { id: lead.id, name: lead.name, phone: telefone }, body)
  return { ok: true, conversationId }
})
