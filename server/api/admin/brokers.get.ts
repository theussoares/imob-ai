import { listBrokers } from '~~/server/repositories/broker.repository'

/** Lista os corretores do tenant (painel). */
export default defineEventHandler(async (event) => {
  const { client, tenant } = await requireTenantMember(event)
  return listBrokers(client, tenant.id)
})
