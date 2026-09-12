import type { PortalUserInput } from '~~/shared/models/portal'
import { invitePortalUser } from '~~/server/repositories/portal-invite.repository'

/**
 * Convida um cliente para a Área do Cliente.
 *
 * O tenant sai de `requireTenantMember`, NUNCA do body: aceitar `tenantId` do
 * request deixaria qualquer membro de painel cadastrar cliente na imobiliária
 * de outro.
 */
export default defineEventHandler(async (event) => {
  const { tenant } = await requireTenantMember(event)
  const body = await readBody<PortalUserInput>(event)

  // O link tem que voltar para o MESMO host de onde partiu — cada cliente usa o
  // próprio domínio, e um link apontando para o domínio errado leva a pessoa a
  // um portal que não é o dela.
  const origin = getRequestURL(event, { xForwardedHost: true, xForwardedProto: true }).origin
  const redirectTo = `${origin}/area-cliente/definir-senha`

  const result = await invitePortalUser(serviceSupabase(), tenant.id, body, redirectTo)

  // Sem e-mail, sem nome, sem id no log — só o suficiente para separar os casos
  // quando um convite não chegar.
  logWarn('portal_user.invited', {
    tenant: tenant.slug,
    alreadyRegistered: result.alreadyRegistered,
    alreadyClient: result.alreadyClient,
    hasLink: !!result.inviteLink,
  })

  return result
})
