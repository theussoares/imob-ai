import { getContractForClient } from '~~/server/repositories/contract.repository'
import { listDocumentsForClient } from '~~/server/repositories/portal-document.repository'

/**
 * Os documentos que este cliente pode ver neste contrato.
 *
 * Carrega o contrato ANTES, e não por comodidade: é dele que saem os papéis
 * desta pessoa naquele contrato, e são os papéis que decidem a audiência. Pedir
 * os papéis ao request seria deixar o cliente escolher o próprio público-alvo.
 */
export default defineEventHandler(async (event) => {
  const { client, tenant, portalUserId } = await requirePortalUser(event)

  const contractId = getRouterParam(event, 'id') || ''
  const contrato = await getContractForClient(client, tenant.id, portalUserId, contractId)
  if (!contrato) {
    throw createError({ statusCode: 404, statusMessage: 'Contrato não encontrado.' })
  }

  return listDocumentsForClient(client, tenant.id, contractId, contrato.roles)
})
