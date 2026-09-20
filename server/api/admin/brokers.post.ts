import type { BrokerInput } from '~~/shared/models/broker'
import { createBroker } from '~~/server/repositories/broker.repository'

/** Cria um corretor. */
export default defineEventHandler(async (event) => {
  const { client, tenant } = await requireTenantMember(event)
  const body = await readBody<BrokerInput>(event)
  assertBrokerInput(body)
  const broker = await createBroker(client, tenant.id, body)
  await invalidateTenantCache(tenant.id)
  return broker
})
