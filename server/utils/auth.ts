import type { H3Event } from 'h3'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '~~/shared/types/database.types'
import { getMembership } from '~~/server/repositories/tenant.repository'

/**
 * Garante que a requisição vem de um usuário autenticado (token Bearer emitido
 * pelo Supabase Auth) que é membro do tenant resolvido pelo host. Retorna um
 * client Supabase vinculado a esse token (RLS de membro aplicada).
 *
 * Cada recusa é registrada. Antes não havia log nenhum aqui, e uma cliente
 * recusada em produção não deixava rastro: descobrir o motivo virou três
 * mensagens de hipótese em vez de uma consulta ao log. Nada de token, e-mail ou
 * id de usuário vai para o registro — só o suficiente para separar os casos.
 */
export async function requireTenantMember(event: H3Event) {
  const authHeader = getHeader(event, 'authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
  if (!token) {
    logWarn('auth.rejected', { reason: 'missing_token', path: event.path })
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
    // O caso que mais confunde: token que o navegador considera bom e o Supabase
    // recusa — sessão revogada em outro dispositivo, usuário apagado, refresh
    // que falhou. Sem isto registrado, só resta adivinhar.
    logWarn('auth.rejected', {
      reason: 'invalid_token',
      path: event.path,
      detail: error?.message,
    })
    throw createError({ statusCode: 401, statusMessage: 'Sessão inválida ou expirada.' })
  }

  const tenant = useTenantContext(event)
  const membership = await getMembership(client, tenant.id, user.id)
  if (!membership) {
    // Autenticada, mas em outra imobiliária. Relogar não resolve — por isso o
    // painel trata 403 diferente de 401.
    logWarn('auth.rejected', { reason: 'not_member', path: event.path, tenant: tenant.slug })
    throw createError({ statusCode: 403, statusMessage: 'Você não tem acesso a esta imobiliária.' })
  }

  return { user, tenant, client, membership }
}
