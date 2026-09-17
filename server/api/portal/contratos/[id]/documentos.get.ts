import { getContractForClient } from '~~/server/repositories/contract.repository'
import { listDocumentsForClient } from '~~/server/repositories/portal-document.repository'
import { ehUuid } from '~~/shared/utils/uuid'

/**
 * Os documentos que este cliente pode ver neste contrato.
 *
 * Carrega o contrato ANTES, e não por comodidade: é dele que saem os papéis
 * desta pessoa naquele contrato, e são os papéis que decidem a audiência. Pedir
 * os papéis ao request seria deixar o cliente escolher o próprio público-alvo.
 */
export default defineEventHandler(async (event) => {
  const { client, tenant, portalUserId } = await requirePortalUser(event)

  // Id malformado é 404 e não chega ao banco: igual ao contrato em si, e pela
  // mesma razão (22P02 viraria 500, que distingue o id dos outros).
  const contractId = getRouterParam(event, 'id') || ''
  if (!ehUuid(contractId)) {
    throw createError({ statusCode: 404, statusMessage: 'Contrato não encontrado.' })
  }

  const contrato = await getContractForClient(client, tenant.id, portalUserId, contractId)
  if (!contrato) {
    throw createError({ statusCode: 404, statusMessage: 'Contrato não encontrado.' })
  }

  return listDocumentsForClient(client, tenant.id, contractId, contrato.roles)
})
