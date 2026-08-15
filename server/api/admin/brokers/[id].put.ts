import type { BrokerInput } from '~~/shared/models/broker'
import { updateBroker } from '~~/server/repositories/broker.repository'

/** Atualiza um corretor. */
export default defineEventHandler(async (event) => {
  const { client, tenant } = await requireTenantMember(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'ID inválido.' })
  const body = await readBody<BrokerInput>(event)
  assertBrokerInput(body)
  return updateBroker(client, tenant.id, id, body)
})
