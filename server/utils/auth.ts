import type { H3Event } from 'h3'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '~~/shared/types/database.types'
import { getMembership } from '~~/server/repositories/tenant.repository'

/**
 * Garante que a requisição vem de um usuário autenticado (token Bearer emitido
 * pelo Supabase Auth) que é membro do tenant resolvido pelo host. Retorna um
 * client Supabase vinculado a esse token (RLS de membro aplicada).
 */
export async function requireTenantMember(event: H3Event) {
  const authHeader = getHeader(event, 'authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
  if (!token) {
    throw createError({ statusCode: 401, statusMessage: 'Não autenticado.' })
  }

  const config = useRuntimeConfig()
  const client = createClient<Database>(config.public.supabaseUrl, config.public.supabaseKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const {
    data: { user },
    error,
  } = await client.auth.getUser(token)
  if (error || !user) {
    throw createError({ statusCode: 401, statusMessage: 'Sessão inválida ou expirada.' })
  }

  const tenant = useTenantContext(event)
  const membership = await getMembership(client, tenant.id, user.id)
  if (!membership) {
    throw createError({ statusCode: 403, statusMessage: 'Você não tem acesso a esta imobiliária.' })
  }

  return { user, tenant, client, membership }
}
