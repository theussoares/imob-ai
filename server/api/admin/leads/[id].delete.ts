import { deleteLead } from '~~/server/repositories/lead.repository'

/**
 * Exclui um lead. Restrito a admin, igual à policy `leads_member_delete` da 0029.
 *
 * O guard aqui não é redundante com a RLS: um delete que a policy recusa não dá
 * erro no PostgREST — ele apaga zero linhas e responde sucesso. O corretor veria
 * "excluído" e o lead continuaria na tela no próximo carregamento.
 */
export default defineEventHandler(async (event) => {
  const { client, tenant } = await requireTenantAdmin(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'ID inválido.' })
  await deleteLead(client, tenant.id, id)
  return { ok: true }
})
