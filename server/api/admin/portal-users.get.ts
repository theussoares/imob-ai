import { listPortalUsers } from '~~/server/repositories/portal-user.repository'

/** Lista os clientes do portal deste tenant. */
export default defineEventHandler(async (event) => {
  const { client, tenant } = await requireTenantMember(event)
  return listPortalUsers(client, tenant.id)
})
