import { listLeads } from '~~/server/repositories/lead.repository'

/** Contatos recebidos pelo tenant (painel). */
export default defineEventHandler(async (event) => {
  const { client, tenant } = await requireTenantMember(event)
  return listLeads(client, tenant.id)
})
