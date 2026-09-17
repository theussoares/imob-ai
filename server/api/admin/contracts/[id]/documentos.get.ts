import { getContract } from '~~/server/repositories/contract.repository'
import { listDocuments } from '~~/server/repositories/portal-document.repository'

/** Documentos de um contrato para o painel — rascunhos incluídos. */
export default defineEventHandler(async (event) => {
  const { client, tenant } = await requireTenantMember(event)
  const contractId = idDeRota(getRouterParam(event, 'id'))

  const contrato = await getContract(client, tenant.id, contractId)
  if (!contrato) throw createError({ statusCode: 404, statusMessage: 'Contrato não encontrado.' })

  return listDocuments(client, tenant.id, contractId)
})
