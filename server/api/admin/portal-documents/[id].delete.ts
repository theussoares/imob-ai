import { deleteDocument } from '~~/server/repositories/portal-document.repository'

/** Apaga o documento e, por cascata, a trilha de downloads dele. */
export default defineEventHandler(async (event) => {
  const { client, tenant } = await requireTenantMember(event)
  const id = idDeRota(getRouterParam(event, 'id'))

  await deleteDocument(client, tenant.id, id)
  return { ok: true }
})
