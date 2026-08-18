import { inviteMember } from '~~/server/repositories/member.repository'

/**
 * Convida um e-mail para o painel.
 *
 * O tenant sai de `requireTenantMember`, nunca do body: aceitar `tenantId` do
 * request deixaria qualquer usuário autenticado se adicionar à imobiliária de
 * outro cliente.
 */
export default defineEventHandler(async (event) => {
  const { tenant } = await requireTenantMember(event)
  const body = await readBody<{ email?: string }>(event)

  // O link tem que voltar para o mesmo host de onde partiu — cada cliente usa
  // o próprio domínio de painel.
  const origin = getRequestURL(event, { xForwardedHost: true, xForwardedProto: true }).origin
  const redirectTo = `${origin}/admin/definir-senha`

  const result = await inviteMember(serviceSupabase(), tenant.id, body?.email || '', redirectTo)

  logWarn('member.invited', {
    tenant: tenant.slug,
    alreadyRegistered: result.alreadyRegistered,
    alreadyMember: result.alreadyMember,
  })

  return result
})
