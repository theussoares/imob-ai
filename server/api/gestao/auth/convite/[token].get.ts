import { consultarConviteGestao } from '~~/server/utils/gestao-convite'
import { pepperDoOtp } from '~~/server/utils/gestao-otp'

/**
 * Valida o link do convite SEM consumi-lo — a tela decide o que mostrar.
 *
 * Público (quem abre ainda não tem conta), mas escopado pelo tenant do Host: o
 * link de uma imobiliária aberto no domínio de outra não acha nada. Devolve só
 * o que a tela mostra (e-mail e perfil), nunca o id do registro.
 */
export default defineEventHandler(async (event) => {
  const tenant = useTenantContext(event)
  if (!(await gestaoAtiva(tenant.id))) throw createError({ statusCode: 404, statusMessage: 'Página não encontrada.' })

  const r = await consultarConviteGestao(serviceSupabase(), tenant.id, getRouterParam(event, 'token') ?? '', Date.now(), pepperDoOtp())
  if (!r.ok) return r
  return { ok: true as const, convite: { email: r.registro.email, perfil: r.registro.perfil, nome: r.registro.nome } }
})
