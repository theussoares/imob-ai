import { removeMember } from '~~/server/repositories/member.repository'

/** Revoga o acesso de um membro. */
export default defineEventHandler(async (event) => {
  const { tenant, user } = await requireTenantMember(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'ID inválido.' })

  // `user.id` é de quem está autenticado: é o que impede alguém de remover o
  // próprio acesso por engano.
  await removeMember(serviceSupabase(), tenant.id, id, user.id)
  return { ok: true }
})
