import { clienteDeLogin } from '~~/server/utils/gestao-auth'
import { gravarRefreshGestao, lerRefreshGestao, limparRefreshGestao } from '~~/server/utils/gestao-cookie'
import { buscarMembroPorUsuario } from '~~/server/repositories/gestao-member.repository'

/**
 * Renova o token de acesso a partir do cookie HttpOnly do refresh token.
 *
 * Serve ao F5 (o navegador perdeu o token em memória) e à renovação antes de
 * expirar. Não pula o 2º fator: o `session_id` do JWT atravessa o refresh, e
 * `requireGestaoMember` continua exigindo que ele tenha passado por
 * `/auth/codigo`. Quem só fez a senha recebe um token que não abre nada.
 *
 * Confere que o usuário ainda é membro DESTE tenant (por Host, nunca do body):
 * membro removido, ou recurso desligado, não renova.
 */
export default defineEventHandler(async (event) => {
  const tenant = useTenantContext(event)
  if (!(await gestaoAtiva(tenant.id))) throw createError({ statusCode: 404, statusMessage: 'Página não encontrada.' })

  const refresh = lerRefreshGestao(event)
  if (!refresh) throw createError({ statusCode: 401, statusMessage: 'Sessão expirada.' })

  const { data, error } = await clienteDeLogin().auth.refreshSession({ refresh_token: refresh })
  if (!data?.session || error) {
    limparRefreshGestao(event)
    throw createError({ statusCode: 401, statusMessage: 'Sessão expirada.' })
  }

  const membro = await buscarMembroPorUsuario(serviceSupabase(), tenant.id, data.session.user.id)
  if (!membro) {
    limparRefreshGestao(event)
    // `local`: sem escopo seria `global` e derrubaria as sessões do mesmo usuário em outros tenants.
    await serviceSupabase().auth.admin.signOut(data.session.access_token, 'local').catch(() => {})
    throw createError({ statusCode: 401, statusMessage: 'Sessão expirada.' })
  }

  // Novo refresh token (rotação) e janela de 8 h reiniciada.
  gravarRefreshGestao(event, data.session.refresh_token)
  return { accessToken: data.session.access_token, expiresAt: data.session.expires_at ?? null }
})
