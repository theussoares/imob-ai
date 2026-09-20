import type { BrokerInput } from '~~/shared/models/broker'
import { updateBroker } from '~~/server/repositories/broker.repository'

/** Atualiza um corretor. */
export default defineEventHandler(async (event) => {
  const { client, tenant } = await requireTenantMember(event)
  const id = idDeRota(getRouterParam(event, 'id'))
  const body = await readBody<BrokerInput>(event)
  assertBrokerInput(body)
  const broker = await updateBroker(client, tenant.id, id, body)
  await invalidateTenantCache(tenant.id)
  return broker
})
