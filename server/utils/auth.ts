import type { H3Event } from 'h3'
import { serverSupabaseUser, serverSupabaseClient } from '#supabase/server'
import type { Database } from '~~/shared/types/database.types'
import { getMembership } from '~~/server/repositories/tenant.repository'

/**
 * Garante que a requisição vem de um usuário autenticado que é membro do tenant
 * resolvido pelo host. Retorna um client Supabase vinculado ao usuário (RLS de
 * membro aplicada), além do tenant e da associação.
 */
export async function requireTenantMember(event: H3Event) {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Não autenticado.' })
  }
  const tenant = useTenantContext(event)
  const client = await serverSupabaseClient<Database>(event)
  const membership = await getMembership(client, tenant.id, user.id)
  if (!membership) {
    throw createError({ statusCode: 403, statusMessage: 'Você não tem acesso a esta imobiliária.' })
  }
  return { user, tenant, client, membership }
}
