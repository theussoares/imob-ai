import { emailRecuperacaoSenha } from '~~/server/utils/email-templates'
import { enviarEmail } from '~~/server/utils/mailer'

/** Intervalo mínimo entre dois e-mails de redefinição para a MESMA conta. */
const INTERVALO_MS = 5 * 60 * 1000

/**
 * Pedido de redefinição de senha do cliente.
 *
 * Por que passa por aqui em vez de `supabase.auth.resetPasswordForEmail()` no
 * navegador: aquele caminho faz o SUPABASE enviar, e o SMTP do Supabase tem um
 * remetente global por projeto — um nome de exibição só, para todos os tenants.
 * A decisão do plano é que o cliente veja o nome da imobiliária DELE na caixa
 * de entrada e responda para ela. Isso é impossível num remetente global. Então
 * geramos o link com `generateLink` (que não envia nada) e mandamos pelo nosso
 * mailer, com o remetente daquele tenant.
 *
 * ⚠️ A resposta é SEMPRE a mesma, exista ou não a conta, esteja ou não em
 * intervalo, tenha o envio falhado ou não. Diferenciar transformaria este
 * endpoint num verificador de quem é cliente daquela imobiliária: bastaria
 * testar endereços e observar qual responde diferente.
 */
export default defineEventHandler(async (event) => {
  const tenant = useTenantContext(event)

  const body = await readBody<{ email?: string }>(event)
  const email = String(body?.email || '')
    .trim()
    .toLowerCase()

  // A resposta única. Todo caminho abaixo termina nela.
  const resposta = { ok: true }

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return resposta

  const service = serviceSupabase()

  // Só manda para quem É cliente ATIVO deste tenant. Um e-mail que existe no
  // Auth mas pertence a outra imobiliária (ou a um membro do painel) não recebe
  // nada — e quem pediu não fica sabendo da diferença.
  const { data: portalUser } = await service
    .from('portal_users')
    .select('id, name, active, last_recovery_at')
    .eq('tenant_id', tenant.id)
    .eq('email', email)
    .maybeSingle()

  if (!portalUser?.active) {
    logWarn('portal.recuperacao_ignorada', {
      tenant: tenant.slug,
      // Sem o endereço: o log não precisa guardar e-mail de quem nem é cliente.
      motivo: portalUser ? 'inativo' : 'nao_encontrado',
    })
    return resposta
  }

  // Intervalo mínimo por CONTA — ver a migration 0033. Este endpoint é público
  // por natureza (quem esqueceu a senha não está logado), e sem trava ele vira
  // uma máquina de mandar e-mail em nome da imobiliária. O estrago maior não é
  // o incômodo: é a cota diária de envio, que no plano de entrada são 100
  // e-mails e, uma vez esgotada, derruba convite e recuperação de TODOS os
  // tenants.
  const ultimo = portalUser.last_recovery_at
  if (ultimo && Date.now() - new Date(ultimo).getTime() < INTERVALO_MS) {
    logWarn('portal.recuperacao_em_intervalo', { tenant: tenant.slug })
    return resposta
  }

  const origin = getRequestURL(event).origin

  const { data, error } = await service.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: `${origin}/area-cliente/definir-senha` },
  })

  const link = data?.properties?.action_link
  if (error || !link) {
    logError('portal.recuperacao_link_falhou', { tenant: tenant.slug, reason: error?.message })
    return resposta
  }

  // Marca ANTES de enviar. Se marcasse depois, uma falha de envio deixaria a
  // conta sem intervalo e um abusador manteria a torneira aberta justamente no
  // momento em que o provedor está recusando — que é quando a cota importa.
  await service
    .from('portal_users')
    .update({ last_recovery_at: new Date().toISOString() })
    .eq('id', portalUser.id)

  const corpo = emailRecuperacaoSenha({ nomeImobiliaria: tenant.name, link })

  try {
    await enviarEmail({
      para: email,
      assunto: corpo.assunto,
      html: corpo.html,
      texto: corpo.texto,
      remetente: { nome: tenant.name, replyTo: tenant.email },
    })
  } catch (e) {
    // `enviarEmail` já registrou a causa. Aqui só garantimos que a falha não
    // vaze para a resposta e não quebre a resposta única.
    logWarn('portal.recuperacao_envio_falhou', { tenant: tenant.slug, reason: errMessage(e) })
  }

  return resposta
})
