import { getContractForClient } from '~~/server/repositories/contract.repository'
import { ehUuid } from '~~/shared/utils/uuid'

/**
 * Um contrato específico do cliente.
 *
 * 404 quando não é dele. Não 403: um 403 confirmaria que o contrato existe, e
 * quem trocou o id na URL não precisa saber disso.
 *
 * Pela mesma razão, id sem forma de uuid também é 404 e morre antes do banco:
 * `.eq('id', 'abc')` numa coluna `uuid` faz o Postgres devolver 22P02 e o
 * handler responder 500 — e um 500 diria, a quem está sondando, que aquele id é
 * diferente dos outros.
 */
export default defineEventHandler(async (event) => {
  const { client, tenant, portalUserId } = await requirePortalUser(event)

  const id = getRouterParam(event, 'id') || ''
  if (!ehUuid(id)) {
    throw createError({ statusCode: 404, statusMessage: 'Contrato não encontrado.' })
  }

  const contrato = await getContractForClient(client, tenant.id, portalUserId, id)
  if (!contrato) {
    throw createError({ statusCode: 404, statusMessage: 'Contrato não encontrado.' })
  }
  return contrato
})
