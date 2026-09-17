import { setPortalUserActive } from '~~/server/repositories/portal-user.repository'

/**
 * Liga e desliga o acesso de um cliente.
 *
 * Desativar NÃO apaga: as policies do portal passam a recusar a pessoa, mas o
 * cadastro e a trilha de quem baixou o quê continuam de pé — que é exatamente o
 * que não pode sumir quando um contrato encerra.
 */
export default defineEventHandler(async (event) => {
  const { client, tenant } = await requireTenantMember(event)
  const id = idDeRota(getRouterParam(event, 'id'))

  const body = await readBody<{ active?: unknown }>(event)
  if (typeof body?.active !== 'boolean') {
    throw createError({ statusCode: 422, statusMessage: 'Informe se o acesso fica ativo.' })
  }

  return setPortalUserActive(client, tenant.id, id, body.active)
})
