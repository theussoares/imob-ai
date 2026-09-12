import type { H3Event } from 'h3'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '~~/shared/types/database.types'
import {
  canAccessPortal,
  portalEntitlementStatus,
  portalUnavailableMessage,
  todayISODate,
} from '~~/shared/utils/portal-entitlement'

/**
 * Garante que a requisição vem de um CLIENTE do portal (inquilino, proprietário
 * ou fiador) do tenant resolvido pelo host.
 *
 * É o espelho de `requireTenantMember` — e a diferença entre os dois é a feature
 * inteira. Aquele responde "é da imobiliária?"; este responde "é cliente DESTA
 * imobiliária?". Um membro do painel não passa por aqui, e um cliente não passa
 * por lá: são duas portas, e nenhuma abre a outra.
 *
 * O que volta é o `portalUserId` — não o `user.id` do Auth. Todo o resto do
 * portal (contratos, documentos, trilha de download) se pendura no cliente
 * daquele tenant, e a mesma pessoa pode ser cliente de duas imobiliárias com a
 * mesma conta.
 */
export async function requirePortalUser(event: H3Event) {
  const authHeader = getHeader(event, 'authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
  if (!token) {
    logWarn('portal.rejected', { reason: 'missing_token', path: event.path })
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
    logWarn('portal.rejected', {
      reason: 'invalid_token',
      path: event.path,
      detail: error?.message,
    })
    throw createError({ statusCode: 401, statusMessage: 'Sessão inválida ou expirada.' })
  }

  const tenant = useTenantContext(event)

  // A policy `portal_users_self_read` deixa a pessoa ler só a própria linha —
  // então esta consulta já é a checagem de acesso, e não uma busca que precise
  // ser conferida depois.
  const { data: portalUser } = await client
    .from('portal_users')
    .select('id, name, active')
    .eq('tenant_id', tenant.id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!portalUser) {
    // Caso comum e específico: alguém da imobiliária logando no portal por
    // engano (ou o contrário). Não é falha de senha, e mandar "credenciais
    // inválidas" faria a pessoa tentar de novo para sempre.
    logWarn('portal.rejected', { reason: 'not_client', path: event.path, tenant: tenant.slug })
    throw createError({ statusCode: 403, statusMessage: 'Esta conta não tem área do cliente nesta imobiliária.' })
  }

  if (!portalUser.active) {
    // Acesso desligado (contrato encerrado, pedido da imobiliária). O histórico
    // continua no banco; a porta é que fecha.
    logWarn('portal.rejected', { reason: 'inactive', path: event.path, tenant: tenant.slug })
    throw createError({ statusCode: 403, statusMessage: 'Seu acesso está desativado. Fale com a imobiliária.' })
  }

  /*
   * Entitlement do tenant — a Área do Cliente é plano pago.
   *
   * A recusa de verdade já acontece no banco: a migration 0032 pôs este mesmo
   * termo dentro de `is_portal_user()`, que gatilha todas as policies do portal.
   * Sem plano, as consultas voltam vazias por RLS, sem depender desta checagem.
   *
   * O que esta parte acrescenta é a MENSAGEM. Devolver "você não tem contrato
   * nenhum" para quem tem contrato manda a pessoa procurar o problema no lugar
   * errado — e ela vai ligar para a imobiliária dizendo que o sistema perdeu os
   * dados dela.
   *
   * Lê por service role de propósito: o cliente do portal não tem (nem deve ter)
   * policy de leitura em `tenant_features`. A query é escopada por tenant e
   * feature, e devolve uma linha.
   */
  const { data: feature } = await serviceSupabase()
    .from('tenant_features')
    .select('enabled, grace_until')
    .eq('tenant_id', tenant.id)
    .eq('feature', 'portal')
    .maybeSingle()

  const status = portalEntitlementStatus(
    feature ? { enabled: feature.enabled, graceUntil: feature.grace_until } : null,
    todayISODate(),
  )

  if (!canAccessPortal(status)) {
    // O status preciso vai para o LOG, que é interno. Para a tela vai a mensagem
    // genérica: quem está do outro lado é o inquilino, e a situação comercial da
    // imobiliária não é assunto dele. Ver a política de inadimplência no plano.
    logWarn('portal.rejected', {
      reason: 'not_entitled',
      status,
      path: event.path,
      tenant: tenant.slug,
    })
    throw createError({ statusCode: 403, statusMessage: portalUnavailableMessage() })
  }

  return {
    user,
    tenant,
    client,
    portalUserId: portalUser.id,
    portalUserName: portalUser.name,
    /** 'ativo' ou 'em_carencia'. Útil para a tela avisar a imobiliária, nunca o cliente. */
    entitlementStatus: status,
  }
}
