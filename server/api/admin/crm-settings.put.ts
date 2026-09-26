import { setLeadDistribution } from '~~/server/repositories/tenant.repository'

/**
 * Liga ou desliga a roleta. Quem entra nela é escolhido por corretor
 * (`brokers.receives_leads`), e o padrão é ninguém: ligar a roleta sem marcar
 * corretores não muda nada — os leads continuam chegando sem dono.
 */
export default defineEventHandler(async (event) => {
  const { client, tenant } = await requireTenantMember(event)
  const body = await readBody<{ leadDistribution?: unknown }>(event)
  const mode = body?.leadDistribution
  if (mode !== 'manual' && mode !== 'roleta') {
    throw createError({ statusCode: 422, statusMessage: 'Modo de distribuição inválido.' })
  }
  await setLeadDistribution(client, tenant.id, mode)
  return { leadDistribution: mode }
})
