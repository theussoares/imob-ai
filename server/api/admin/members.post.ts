import { inviteMember } from '~~/server/repositories/member.repository'
import { emailConvitePainel } from '~~/server/utils/email-templates'
import { remetenteDoTenant } from '~~/server/utils/mail-sender'
import { enviarEmail } from '~~/server/utils/mailer'
import { painelOrigin } from '~~/server/utils/portal-origin'

/**
 * Convida um e-mail para o painel.
 *
 * O tenant sai de `requireTenantMember`, nunca do body: aceitar `tenantId` do
 * request deixaria qualquer usuário autenticado se adicionar à imobiliária de
 * outro cliente.
 *
 * O convite vai por e-mail (MELHORIA 01, teste de 27/09). O link continua
 * voltando na resposta como plano B — e-mail que cai no spam não pode travar a
 * entrada de alguém da equipe —, mas deixou de ser o caminho principal: o
 * "copie e mande por WhatsApp" era justamente o que matava o convite na prévia.
 */
export default defineEventHandler(async (event) => {
  const { tenant } = await requireTenantMember(event)
  const body = await readBody<{ email?: string }>(event)

  // Do BANCO, não do header: desde que o link aponta direto para a nossa tela
  // (`linkDeAcesso`), a allowlist de Redirect URLs do Supabase não o filtra
  // mais. Com `X-Forwarded-Host`, o convite podia sair apontando para um host
  // forjado (revisão de segurança de 27/09).
  const redirectTo = `${await painelOrigin(serviceSupabase(), tenant)}/admin/definir-senha`

  const result = await inviteMember(serviceSupabase(), tenant.id, body?.email || '', redirectTo)

  let emailEnviado = false
  if (result.inviteLink) {
    const corpo = emailConvitePainel({ nomeImobiliaria: tenant.name, link: result.inviteLink })
    try {
      const r = await enviarEmail({
        para: result.email,
        ...corpo,
        remetente: { nome: tenant.name, endereco: await remetenteDoTenant(tenant), replyTo: tenant.email },
      })
      emailEnviado = r.enviado
    } catch (e) {
      // O vínculo já existe e o link está na resposta: a tela mostra o plano B.
      logWarn('member.convite_email_falhou', { tenant: tenant.slug, reason: errMessage(e) })
    }
  }

  logWarn('member.invited', {
    tenant: tenant.slug,
    alreadyRegistered: result.alreadyRegistered,
    alreadyMember: result.alreadyMember,
    emailEnviado,
  })

  return { ...result, emailEnviado }
})
