import { listAllProperties } from '~~/server/repositories/property.repository'

/** Lista todos os imóveis do tenant (qualquer status) para o painel. */
export default defineEventHandler(async (event) => {
  const { client, tenant } = await requireTenantMember(event)
  return listAllProperties(client, tenant.id)
})
