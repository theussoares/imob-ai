import { janelaAberta } from '~~/shared/models/whatsapp'
import { getConversation, listMessages } from '~~/server/repositories/whatsapp.repository'

/** A conversa aberta: cabeçalho, mensagens e se ainda dá para responder com texto livre. */
export default defineEventHandler(async (event) => {
  const { client, tenant } = await requireTenantMember(event)
  await exigirWhatsapp(tenant.id)
  const id = idDeRota(getRouterParam(event, 'id'))
  const conversa = await getConversation(client, tenant.id, id)
  if (!conversa) throw createError({ statusCode: 404, statusMessage: 'Conversa não encontrada.' })
  const mensagens = await listMessages(client, tenant.id, id)
  return { conversa, mensagens, janelaAberta: janelaAberta(conversa.lastInboundAt, new Date()) }
})
