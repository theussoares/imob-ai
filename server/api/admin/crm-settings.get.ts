import { getLeadDistribution } from '~~/server/repositories/tenant.repository'

/** Configuração do CRM: por enquanto, só o modo de distribuição de leads. */
export default defineEventHandler(async (event) => {
  const { client, tenant } = await requireTenantMember(event)
  return { leadDistribution: await getLeadDistribution(client, tenant.id) }
})
