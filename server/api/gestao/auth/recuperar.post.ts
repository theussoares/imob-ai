import { emailValido, normalizarEmail } from '~~/layers/gestao/domain/auth'
import { exigirCaptcha } from '~~/server/utils/gestao-captcha'
import { pepperDoOtp } from '~~/server/utils/gestao-otp'
import { solicitarRecuperacao } from '~~/server/utils/gestao-recuperacao'
import { emailRecuperacaoSenhaGestao } from '~~/server/utils/email-templates'
import { remetenteDoTenant } from '~~/server/utils/mail-sender'
import { enviarEmail } from '~~/server/utils/mailer'
import { portalOrigin } from '~~/server/utils/portal-origin'

/**
 * «Esqueci minha senha» do /gestao. Público por natureza (quem esqueceu não tem sessão).
 * A resposta é sempre `{ ok: true }`, exista a conta ou não; a regra está em `solicitarRecuperacao`.
 */
export default defineEventHandler(async (event) => {
  const tenant = useTenantContext(event)
  if (!(await gestaoAtiva(tenant.id))) throw createError({ statusCode: 404, statusMessage: 'Página não encontrada.' })

  const body = await readBody<{ email?: unknown; captcha?: unknown }>(event)
  const email = normalizarEmail(typeof body?.email === 'string' ? body.email : '')
  await exigirCaptcha(event, body?.captcha)
  if (!emailValido(email)) return { ok: true }

  const db = serviceSupabase()
  const ip = clientIpFrom((name) => getHeader(event, name))
  await solicitarRecuperacao({
    db,
    tenant,
    email,
    ip: ip ? rateLimitIpKey(ip) : null,
    pepper: pepperDoOtp(),
    agora: Date.now(),
    origem: await portalOrigin(db, tenant).catch(() => ''),
    enviar: async (link) => {
      await enviarEmail({
        para: email,
        ...emailRecuperacaoSenhaGestao({ nomeImobiliaria: tenant.name, link }),
        rotuloDeLog: 'gestao.recuperacao',
        remetente: { nome: tenant.name, endereco: await remetenteDoTenant(tenant), replyTo: tenant.email },
      })
    },
  })
  return { ok: true }
})
