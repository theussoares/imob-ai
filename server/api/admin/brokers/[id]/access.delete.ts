import { revokeBrokerPanelAccess } from '~~/server/repositories/broker.repository'

/** Tira o acesso do corretor ao painel. O cadastro dele continua existindo. */
export default defineEventHandler(async (event) => {
  const { tenant, user } = await requireTenantAdmin(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'ID inválido.' })

  await revokeBrokerPanelAccess(serviceSupabase(), tenant.id, id, user.id)

  logWarn('broker.access_revoked', { tenant: tenant.slug })

  return { ok: true }
})
