import { validarSenha } from '~~/layers/gestao/domain/auth'
import { consultarConviteGestao } from '~~/server/utils/gestao-convite'
import { chaveDeFalha, pepperDoOtp } from '~~/server/utils/gestao-otp'
import { clienteDeLogin, exigirLimiteLogin, registrarFalhaLogin } from '~~/server/utils/gestao-auth'
import { vincularUsuarioAoConvite } from '~~/server/repositories/gestao-member.repository'
import { registrarEvento } from '~~/server/repositories/gestao-evento.repository'

/**
 * Aceita o convite: cria a conta no Supabase Auth com a senha escolhida e liga o
 * usuário ao registro do convite.
 *
 * O perfil vem do CONVITE, nunca do body: quem aceita não escolhe o que será.
 * A regra de senha é a do domínio (`validarSenha`), revalidada aqui porque o
 * botão desabilitado da tela não é barreira.
 *
 * ⚠️ E-mail que já tem conta no Auth (alguém do /admin, ou de outra imobiliária):
 * NÃO trocamos a senha. Trocar a partir de um link de convite é tomar a conta de
 * alguém (mesmo motivo de `member.repository.ts`, que não emite link para conta
 * existente). Pedimos a senha DAQUELA conta e só ligamos com ela certa — e esse
 * caminho conta falhas como o login, senão viraria um oráculo de senha sem limite
 * para quem tem o link.
 */
export default defineEventHandler(async (event) => {
  const tenant = useTenantContext(event)
  if (!(await gestaoAtiva(tenant.id))) throw createError({ statusCode: 404, statusMessage: 'Página não encontrada.' })

  const body = await readBody<{ token?: unknown; nome?: unknown; senha?: unknown }>(event)
  const token = typeof body?.token === 'string' ? body.token : ''
  const nome = typeof body?.nome === 'string' ? body.nome.trim().replace(/\s+/g, ' ') : ''
  const senha = typeof body?.senha === 'string' ? body.senha : ''
  if (nome.length < 2 || nome.length > 120) throw createError({ statusCode: 422, statusMessage: 'Informe seu nome.' })
  if (!senha || senha.length > 200) throw createError({ statusCode: 422, statusMessage: 'A senha não cumpre os requisitos.' })

  const db = serviceSupabase()
  const pepper = pepperDoOtp()
  const agora = Date.now()
  const consulta = await consultarConviteGestao(db, tenant.id, token, agora, pepper)
  if (!consulta.ok) throw createError({ statusCode: 422, statusMessage: consulta.erro, data: { motivo: consulta.motivo } })
  const convite = consulta.registro

  if (!validarSenha(senha, { email: convite.email, nome }).ok) {
    throw createError({ statusCode: 422, statusMessage: 'A senha não cumpre os requisitos.' })
  }

  let userId: string
  let criadoAgora = false
  const criado = await db.auth.admin.createUser({ email: convite.email, password: senha, email_confirm: true })
  if (criado.data?.user) {
    userId = criado.data.user.id
    criadoAgora = true
  } else {
    const jaExiste = criado.error?.code === 'email_exists' || /already/i.test(criado.error?.message ?? '')
    if (!jaExiste) {
      logError('gestao.aceite_falhou', { tenant: tenant.slug, reason: criado.error?.message })
      throw createError({ statusCode: 502, statusMessage: 'Não foi possível criar a conta. Tente novamente.' })
    }
    // Conta existente: prova de posse pela senha dela, com o limite do login.
    const chaves = { conta: chaveDeFalha(pepper, 'conta', convite.email), ip: null }
    await exigirLimiteLogin(db, tenant.id, chaves, agora)
    const login = await clienteDeLogin().auth.signInWithPassword({ email: convite.email, password: senha })
    if (login.error || !login.data.user) {
      await registrarFalhaLogin(db, tenant.id, chaves, agora)
      logWarn('gestao.aceite_conta_existente', { tenant: tenant.slug, reason: criado.error?.message })
      throw createError({
        statusCode: 422,
        statusMessage: 'Este e-mail já tem uma conta. Para aceitar o convite, use a senha dessa conta.',
        data: { motivo: 'conta_existente' },
      })
    }
    userId = login.data.user.id
    // A sessão aberta só para provar a senha não serve para mais nada.
    await db.auth.admin.signOut(login.data.session.access_token).catch(() => {})
  }

  const ligado = await vincularUsuarioAoConvite(db, tenant.id, convite.id, userId, nome)
  if (!ligado) {
    // Outra aba aceitou antes. A conta criada aqui ficaria órfã, sem vínculo nenhum.
    if (criadoAgora) await db.auth.admin.deleteUser(userId).catch(() => {})
    throw createError({ statusCode: 422, statusMessage: 'Este convite já foi usado. Se foi você, entre com e-mail e senha.', data: { motivo: 'usado' } })
  }

  await registrarEvento(db, tenant.id, { atorUserId: userId, atorNome: nome, acao: 'Aceitou o convite', alvoTipo: 'membro', alvoId: convite.id })
  return { ok: true as const }
})
