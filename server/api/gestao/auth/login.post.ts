import { ERRO_LOGIN, emailValido, normalizarEmail } from '~~/layers/gestao/domain/auth'
import { chaveDeFalha, pepperDoOtp } from '~~/server/utils/gestao-otp'
import {
  clienteDeLogin,
  emitirCodigoGestao,
  enviarCodigoGestao,
  exigirLimiteLogin,
  registrarFalhaLogin,
} from '~~/server/utils/gestao-auth'
import { gravarRefreshGestao } from '~~/server/utils/gestao-cookie'
import { buscarMembroPorUsuario } from '~~/server/repositories/gestao-member.repository'

/**
 * Login do painel de gestão: e-mail + senha pelo Supabase Auth, depois o código
 * de 6 dígitos por e-mail.
 *
 * Os tokens voltam já aqui (spec), mas sozinhos não abrem nada no /gestao:
 * `requireGestaoMember` exige que a `session_id` deles tenha passado pelo
 * `/auth/codigo`. Um login novo é uma sessão nova, então pede código de novo.
 *
 * Mensagem única (`ERRO_LOGIN`) para senha errada, e-mail sem conta e conta que
 * não é membro desta imobiliária: o login não pode responder quem tem acesso.
 */
export default defineEventHandler(async (event) => {
  const tenant = useTenantContext(event)
  if (!(await gestaoAtiva(tenant.id))) throw createError({ statusCode: 404, statusMessage: 'Página não encontrada.' })

  const body = await readBody<{ email?: unknown; senha?: unknown }>(event)
  const email = normalizarEmail(typeof body?.email === 'string' ? body.email : '')
  const senha = typeof body?.senha === 'string' ? body.senha : ''
  if (!emailValido(email) || !senha || senha.length > 200) throw createError({ statusCode: 401, statusMessage: ERRO_LOGIN })

  const db = serviceSupabase()
  const pepper = pepperDoOtp()
  const agora = Date.now()
  const ip = clientIpFrom((name) => getHeader(event, name))
  const chaves = { conta: chaveDeFalha(pepper, 'conta', email), ip: ip ? chaveDeFalha(pepper, 'ip', rateLimitIpKey(ip)) : null }
  await exigirLimiteLogin(db, tenant.id, chaves, agora)

  const { data, error } = await clienteDeLogin().auth.signInWithPassword({ email, password: senha })
  const membro = data?.user && !error ? await buscarMembroPorUsuario(db, tenant.id, data.user.id) : null
  if (!data?.session || !membro) {
    await registrarFalhaLogin(db, tenant.id, chaves, agora)
    // Senha certa de quem não é membro daqui: a sessão aberta não serve para nada.
    if (data?.session) await db.auth.admin.signOut(data.session.access_token).catch(() => {})
    throw createError({ statusCode: 401, statusMessage: ERRO_LOGIN })
  }

  const envio = await emitirCodigoGestao(db, {
    tenantId: tenant.id,
    userId: membro.userId,
    agora,
    pepper,
    enviar: (codigo) => enviarCodigoGestao(tenant, email, codigo),
  })
  if (!envio.enviado && envio.motivo === 'bloqueado') {
    await db.auth.admin.signOut(data.session.access_token).catch(() => {})
    throw createError({ statusCode: 429, statusMessage: envio.erro, data: { motivo: 'bloqueado', segundos: envio.segundos } })
  }

  // O refresh token fica só no cookie HttpOnly (ver gestao-cookie.ts): o navegador não o recebe no corpo.
  gravarRefreshGestao(event, data.session.refresh_token)
  return {
    accessToken: data.session.access_token,
    expiresAt: data.session.expires_at ?? null,
    // `aguarde`: o código de menos de 60 s atrás continua valendo; a tela só mostra a contagem.
    codigo: envio.enviado ? { enviado: true, segundos: envio.segundos } : { enviado: false, segundos: envio.segundos, aviso: envio.erro },
  }
})
