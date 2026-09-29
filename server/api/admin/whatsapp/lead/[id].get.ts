import { getConversationIdByLead } from '~~/server/repositories/whatsapp.repository'

/** A conversa deste contato, para o atalho "Abrir conversa" na ficha. */
export default defineEventHandler(async (event) => {
  const { client, tenant } = await requireTenantMember(event)
  await exigirWhatsapp(tenant.id)
  const leadId = idDeRota(getRouterParam(event, 'id'))
  return { conversationId: await getConversationIdByLead(client, tenant.id, leadId) }
})
