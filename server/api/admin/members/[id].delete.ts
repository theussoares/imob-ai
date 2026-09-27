import { removeMember } from '~~/server/repositories/member.repository'

/** Revoga o acesso de um membro. */
export default defineEventHandler(async (event) => {
  const { tenant, user, membership } = await requireTenantMember(event)
  const id = idDeRota(getRouterParam(event, 'id'))

  // `user.id` é de quem está autenticado: é o que impede alguém de remover o
  // próprio acesso por engano.
  await removeMember(serviceSupabase(), tenant.id, id, { userId: user.id, role: membership.role })
  return { ok: true }
})
