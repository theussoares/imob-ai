import { deleteDocument } from '~~/server/repositories/portal-document.repository'

/** Apaga o documento e, por cascata, a trilha de downloads dele. */
export default defineEventHandler(async (event) => {
  const { client, tenant } = await requireTenantMember(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'ID inválido.' })

  await deleteDocument(client, tenant.id, id)
  return { ok: true }
})
