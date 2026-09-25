import { listClientsWithContracts } from '~~/server/repositories/portal-user.repository'

/** Clientes da imobiliária, com os contratos e o papel de cada um. */
export default defineEventHandler(async (event) => {
  const { client, tenant } = await requireTenantMember(event)
  return listClientsWithContracts(client, tenant.id)
})
