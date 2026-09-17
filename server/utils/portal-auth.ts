import type { H3Event } from 'h3'
import { createClient } from '@supabase/supabase-js'
import { recursoAtivo } from '~~/shared/utils/portal-access'
import type { Database } from '~~/shared/types/database.types'

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

  // O recurso está ligado para esta imobiliária?
  //
  // A RLS já fecha tudo quando não está (0036), mas ali o cliente veria uma
  // LISTA VAZIA — que parece bug, não parece indisponibilidade. Aqui a resposta
  // é legível.
  //
  // ⚠️ A mensagem NÃO menciona pagamento, por decisão registrada no plano:
  // expor a inadimplência da imobiliária aos clientes DELA é dano à imagem de
  // terceiro. O cliente é mandado para quem tem a relação com ele.
  const { data: recurso } = await serviceSupabase()
    .from('tenant_features')
    .select('enabled, grace_until')
    .eq('tenant_id', tenant.id)
    .eq('feature', 'portal')
    .maybeSingle()

  // Mesma função que o teste cobre — a régua de carência não pode ter duas
  // implementações que discordam.
  const ativo = recursoAtivo(
    recurso ? { enabled: recurso.enabled, graceUntil: recurso.grace_until } : null,
  )

  if (!ativo) {
    logWarn('portal.rejected', { reason: 'feature_off', path: event.path, tenant: tenant.slug })
    throw createError({
      statusCode: 403,
      statusMessage:
        'A Área do Cliente está temporariamente indisponível. Fale com a imobiliária.',
    })
  }

  // A policy `portal_users_self_read` deixa a pessoa ler só a própria linha —
  // então esta consulta já é a checagem de acesso, e não uma busca que precise
  // ser conferida depois.
  const { data: portalUser } = await client
    .from('portal_users')
    .select('id, name, active, access_confirmed_at')
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

  // A pessoa entrou: o vínculo dela com ESTA imobiliária está confirmado.
  //
  // É a outra metade da regra do token em `portal-invite.repository.ts`. Um
  // cadastro que nasceu de conta preexistente (caso 3) fica com
  // `access_confirmed_at` nulo, e nenhum reenvio do painel produz link de
  // senha enquanto estiver assim — é o que impede convidar duas vezes o e-mail
  // de um terceiro e mandar um reset forçado para a caixa dele. Só quem tem a
  // senha chega até aqui, então só a própria pessoa confirma.
  //
  // Escreve por service role: a policy `portal_users_self_read` é de leitura, e
  // deixar o cliente escrever a própria linha abriria bem mais do que isto.
  // Roda uma vez por cadastro — depois a coluna já não é nula.
  if (!portalUser.access_confirmed_at) {
    const { error: erroConfirmacao } = await serviceSupabase()
      .from('portal_users')
      .update({ access_confirmed_at: new Date().toISOString() })
      .eq('id', portalUser.id)
      .is('access_confirmed_at', null)

    // Falhar aqui NÃO derruba a requisição: a pessoa tem direito ao que veio
    // buscar, e o efeito de não gravar é só o reenvio continuar sem token —
    // que erra para o lado seguro.
    if (erroConfirmacao) {
      logWarn('portal.confirmacao_falhou', {
        tenant: tenant.slug,
        reason: erroConfirmacao.message,
      })
    }
  }

  return { user, tenant, client, portalUserId: portalUser.id, portalUserName: portalUser.name }
}
