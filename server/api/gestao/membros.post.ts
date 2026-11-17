import { CONVITE_VALIDADE_MS, emailValido, normalizarEmail } from '~~/layers/gestao/domain/auth'
import { PERFIS } from '~~/layers/gestao/domain/permissions'
import { exigirPermissao, requireGestaoMember } from '~~/server/utils/gestao-auth'
import { novoTokenConvite } from '~~/server/utils/gestao-convite'
import { hashTokenConvite, pepperDoOtp } from '~~/server/utils/gestao-otp'
import { perfilECorretorDoPedido, regraConvite } from '~~/server/utils/gestao-membros'
import { corretorDoTenant, gravarConvite } from '~~/server/repositories/gestao-member.repository'
import { registrarEvento } from '~~/server/repositories/gestao-evento.repository'
import { toMembroLista } from '~~/server/mappers/gestao-member.mapper'
import { emailConviteGestao } from '~~/server/utils/email-templates'
import { enviarEmail } from '~~/server/utils/mailer'
import { remetenteDoTenant } from '~~/server/utils/mail-sender'
import { portalOrigin } from '~~/server/utils/portal-origin'

/**
 * Convida alguém para o painel de gestão (permissão `convidar`).
 *
 * O tenant sai do contexto autenticado, nunca do body. O perfil de quem convida é
 * teto (`regraConvite`). Corretor precisa de um corretor cadastrado NESTE tenant.
 *
 * O link vai SÓ por e-mail, nunca na resposta (diferente do plano B do /admin).
 * Com o link, quem convida criaria a conta de um e-mail que não é dele, já
 * confirmada e com a senha que escolhesse (revisão de segurança da F1). E o
 * plano B não serviria de nada aqui: sem e-mail funcionando ninguém passa do
 * código do 2º fator. E-mail que não saiu volta `emailEnviado: false`; reenviar
 * é convidar de novo, que troca o token.
 *
 * O link aponta para a origem pública do tenant tirada do BANCO
 * (`portalOrigin`), não do Host: com `X-Forwarded-Host` forjado o convite sairia
 * apontando para outro servidor, levando o token junto.
 */
export default defineEventHandler(async (event) => {
  const ctx = await requireGestaoMember(event)
  exigirPermissao(ctx, 'convidar')

  const body = (await readBody<Record<string, unknown>>(event)) ?? {}
  const email = normalizarEmail(typeof body.email === 'string' ? body.email : '')
  if (!emailValido(email) || email.length > 160) throw createError({ statusCode: 422, statusMessage: 'Informe um e-mail válido.' })
  const nome = typeof body.nome === 'string' ? body.nome.trim().slice(0, 120) : ''
  const { perfil, brokerId } = perfilECorretorDoPedido(body)

  const erro = regraConvite(ctx.membro.perfil, perfil)
  if (erro) throw createError({ statusCode: 403, statusMessage: erro })
  if (brokerId && !(await corretorDoTenant(ctx.db, ctx.tenant.id, brokerId))) {
    throw createError({ statusCode: 422, statusMessage: 'Corretor não encontrado.' })
  }

  const agora = Date.now()
  const token = novoTokenConvite()
  const registro = await gravarConvite(ctx.db, ctx.tenant.id, {
    email,
    nome,
    perfil,
    brokerId,
    tokenHash: hashTokenConvite(pepperDoOtp(), token),
    expiraEm: new Date(agora + CONVITE_VALIDADE_MS).toISOString(),
    convidadoPor: ctx.membro.nome,
    perfilConvidante: ctx.membro.perfil,
  })

  const link = `${await portalOrigin(ctx.db, ctx.tenant)}/gestao/convite/${token}`
  let emailEnviado = false
  try {
    const corpo = emailConviteGestao({ nomeImobiliaria: ctx.tenant.name, link, perfil: PERFIS[perfil].nome })
    const r = await enviarEmail({
      para: email,
      ...corpo,
      remetente: { nome: ctx.tenant.name, endereco: await remetenteDoTenant(ctx.tenant), replyTo: ctx.tenant.email },
    })
    emailEnviado = r.enviado
  } catch (e) {
    logWarn('gestao.convite_email_falhou', { tenant: ctx.tenant.slug, reason: errMessage(e) })
  }

  await registrarEvento(ctx.db, ctx.tenant.id, {
    atorUserId: ctx.membro.userId,
    atorNome: ctx.membro.nome,
    acao: `Convidou (${PERFIS[perfil].nome})`,
    alvoTipo: 'membro',
    alvoId: registro.id,
  })

  return { membro: toMembroLista(registro, agora), emailEnviado }
})
