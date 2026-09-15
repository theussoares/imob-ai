import { getContractForClient } from '~~/server/repositories/contract.repository'

/**
 * Um contrato específico do cliente.
 *
 * 404 quando não é dele. Não 403: um 403 confirmaria que o contrato existe, e
 * quem trocou o id na URL não precisa saber disso.
 */
export default defineEventHandler(async (event) => {
  const { client, tenant, portalUserId } = await requirePortalUser(event)

  const id = getRouterParam(event, 'id') || ''
  const contrato = await getContractForClient(client, tenant.id, portalUserId, id)
  if (!contrato) {
    throw createError({ statusCode: 404, statusMessage: 'Contrato não encontrado.' })
  }
  return contrato
})
