import { exigirCaptcha } from '~~/server/utils/gestao-captcha'
import { clienteDeLogin } from '~~/server/utils/gestao-auth'
import { pepperDoOtp } from '~~/server/utils/gestao-otp'
import { redefinirSenha } from '~~/server/utils/gestao-recuperacao'

/**
 * Troca a senha com o link de recuperação. Só aqui o token é gasto (a página do link não o verifica ao abrir).
 * Não abre sessão: depois da troca todas as sessões saem e o login normal (senha + código) segue valendo.
 */
export default defineEventHandler(async (event) => {
  const tenant = useTenantContext(event)
  if (!(await gestaoAtiva(tenant.id))) throw createError({ statusCode: 404, statusMessage: 'Página não encontrada.' })

  const body = await readBody<{ tokenHash?: unknown; senha?: unknown; captcha?: unknown }>(event)
  const tokenHash = typeof body?.tokenHash === 'string' ? body.tokenHash.trim() : ''
  const senha = typeof body?.senha === 'string' ? body.senha : ''
  if (!tokenHash || tokenHash.length > 200) throw createError({ statusCode: 422, statusMessage: 'Este link expirou ou já foi usado. Peça um novo na tela de login.', data: { motivo: 'link' } })

  await exigirCaptcha(event, body?.captcha)

  const ip = clientIpFrom((name) => getHeader(event, name))
  const r = await redefinirSenha({
    db: serviceSupabase(),
    cliente: clienteDeLogin(),
    tenant,
    tokenHash,
    senha,
    ip: ip ? rateLimitIpKey(ip) : null,
    pepper: pepperDoOtp(),
    agora: Date.now(),
  })
  if (!r.ok) throw createError({ statusCode: r.status, statusMessage: r.erro, data: { motivo: r.motivo } })
  return { ok: true }
})
