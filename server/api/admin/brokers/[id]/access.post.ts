import { grantBrokerPanelAccess } from '~~/server/repositories/broker.repository'

/**
 * Dá ao corretor acesso ao painel (papel 'broker': só a carteira dele).
 *
 * `requireTenantAdmin` e não `requireTenantMember`: quem entra por aqui usa
 * service role, que ignora a RLS. Sem o guard, um corretor concederia acesso —
 * inclusive ligando outro cadastro ao próprio login.
 */
export default defineEventHandler(async (event) => {
  const { tenant } = await requireTenantAdmin(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'ID inválido.' })

  // O link volta para o mesmo host de onde partiu — cada cliente usa o próprio
  // domínio de painel.
  const origin = getRequestURL(event, { xForwardedHost: true, xForwardedProto: true }).origin
  const redirectTo = `${origin}/admin/definir-senha`

  const result = await grantBrokerPanelAccess(serviceSupabase(), tenant.id, id, redirectTo)

  logWarn('broker.access_granted', {
    tenant: tenant.slug,
    alreadyRegistered: result.alreadyRegistered,
  })

  return result
})
