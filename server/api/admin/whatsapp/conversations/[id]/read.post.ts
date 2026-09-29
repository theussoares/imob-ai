import { getConversationState, updateConversation } from '~~/server/repositories/whatsapp.repository'

/**
 * Marca como lida. A existência é conferida pelo client do MEMBRO (RLS) antes
 * da escrita pela service_role — que é quem pode escrever nesta tabela.
 */
export default defineEventHandler(async (event) => {
  const { client, tenant } = await requireTenantMember(event)
  await exigirWhatsapp(tenant.id)
  const id = idDeRota(getRouterParam(event, 'id'))
  const state = await getConversationState(client, tenant.id, id)
  if (!state) throw createError({ statusCode: 404, statusMessage: 'Conversa não encontrada.' })
  if (state.unreadCount > 0) await updateConversation(serviceSupabase(), tenant.id, id, { unread_count: 0 })
  return { ok: true }
})
