import { deleteLead } from '~~/server/repositories/lead.repository'

/** Exclui um lead. */
export default defineEventHandler(async (event) => {
  const { client, tenant } = await requireTenantMember(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'ID inválido.' })
  await deleteLead(client, tenant.id, id)
  return { ok: true }
})
