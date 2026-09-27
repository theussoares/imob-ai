import { emailRecuperacaoSenha } from '~~/server/utils/email-templates'
import { remetenteDoTenant } from '~~/server/utils/mail-sender'
import { enviarEmail } from '~~/server/utils/mailer'
import { portalOrigin, urlDefinirSenha } from '~~/server/utils/portal-origin'
import { linkDeAcesso } from '~~/server/utils/auth-link'

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
    .select('id, name, active')
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
  //
  // A trava é um UPDATE condicional, feito antes de gerar o link: "ler,
  // comparar e gravar" deixava pedidos simultâneos passarem todos, porque
  // liam o mesmo valor antigo (revisão de segurança de 27/09). Marcar antes
  // também mantém a regra antiga — uma falha de envio não abre a torneira.
  const limite = new Date(Date.now() - INTERVALO_MS).toISOString()
  const { data: reservado } = await service
    .from('portal_users')
    .update({ last_recovery_at: new Date().toISOString() })
    .eq('tenant_id', tenant.id)
    .eq('id', portalUser.id)
    .or(`last_recovery_at.is.null,last_recovery_at.lt.${limite}`)
    .select('id')
  if (!reservado?.length) {
    logWarn('portal.recuperacao_em_intervalo', { tenant: tenant.slug })
    return resposta
  }

  // Do BANCO, não do header: este endpoint é público, e um `X-Forwarded-Host`
  // forjado faria o e-mail da vítima chegar com um link apontando para o
  // servidor de quem forjou — que receberia o token ao primeiro clique.
  const origem = await portalOrigin(service, tenant)

  const destino = urlDefinirSenha(origem)
  const { data, error } = await service.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: destino },
  })

  const link = linkDeAcesso(destino, data?.properties)
  if (error || !link) {
    logError('portal.recuperacao_link_falhou', { tenant: tenant.slug, reason: error?.message })
    return resposta
  }

  const corpo = emailRecuperacaoSenha({ nomeImobiliaria: tenant.name, link })

  try {
    await enviarEmail({
      para: email,
      assunto: corpo.assunto,
      html: corpo.html,
      texto: corpo.texto,
      remetente: {
        nome: tenant.name,
        endereco: await remetenteDoTenant(tenant),
        replyTo: tenant.email,
      },
    })
  } catch (e) {
    // `enviarEmail` já registrou a causa. Aqui só garantimos que a falha não
    // vaze para a resposta e não quebre a resposta única.
    logWarn('portal.recuperacao_envio_falhou', { tenant: tenant.slug, reason: errMessage(e) })
  }

  return resposta
})
