import { listContracts } from '~~/server/repositories/contract.repository'

/** Lista os contratos do tenant para o painel. */
export default defineEventHandler(async (event) => {
  const { client, tenant } = await requireTenantMember(event)
  return listContracts(client, tenant.id)
})
