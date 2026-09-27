import { emailRecuperacaoSenhaPainel } from '~~/server/utils/email-templates'
import { remetenteDoTenant } from '~~/server/utils/mail-sender'
import { enviarEmail } from '~~/server/utils/mailer'
import { painelOrigin } from '~~/server/utils/portal-origin'
import { linkDeAcesso } from '~~/server/utils/auth-link'

/** Intervalo mínimo entre dois e-mails de redefinição para o MESMO vínculo. */
const INTERVALO_MS = 5 * 60 * 1000

/**
 * "Esqueci minha senha" do painel (MELHORIA 03, teste de 27/09).
 *
 * Não existia. Um convite que falhasse deixava a conta criada e presa:
 * re-convidar não devolve link (`inviteMember`, por segurança) e só um SQL
 * manual destravava — foi o que aconteceu com o convite gasto pela prévia do
 * WhatsApp.
 *
 * Fora de `/api/admin` porque é público por natureza: quem esqueceu a senha
 * não está logado.
 *
 * Mesmas regras do `/api/portal/recuperar-senha`, e pelos mesmos motivos:
 * - só manda para quem É membro DESTE tenant. E-mail do Auth que é de outra
 *   imobiliária, ou de cliente do portal, não recebe nada — senão este
 *   endpoint forçaria reset de conta alheia com o remetente de uma imobiliária;
 * - resposta SEMPRE a mesma, para não virar verificador de quem é da equipe;
 * - intervalo por vínculo (0056), gravado ANTES de enviar;
 * - origem do link sai do BANCO, nunca do header (ver `portalOrigin`).
 */
export default defineEventHandler(async (event) => {
  const tenant = useTenantContext(event)
  const body = await readBody<{ email?: string }>(event)
  const email = String(body?.email || '').trim().toLowerCase()
  const resposta = { ok: true }
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return resposta

  const service = serviceSupabase()
  const { data: membros, error } = await service
    .from('tenant_members')
    .select('id, user_id, last_recovery_at')
    .eq('tenant_id', tenant.id)
  if (error) {
    logError('painel.recuperacao_leitura_falhou', { tenant: tenant.slug, reason: error.message })
    return resposta
  }

  // Poucos membros por imobiliária: perguntar ao Auth um a um é barato e evita
  // varrer o `auth.users` de todos os tenants atrás de um e-mail.
  let membro: { id: string; last_recovery_at: string | null } | null = null
  for (const m of membros ?? []) {
    const { data } = await service.auth.admin.getUserById(m.user_id)
    if (data?.user?.email?.toLowerCase() === email) {
      membro = m
      break
    }
  }
  if (!membro) {
    logWarn('painel.recuperacao_ignorada', { tenant: tenant.slug, motivo: 'nao_encontrado' })
    return resposta
  }

  const ultimo = membro.last_recovery_at
  if (ultimo && Date.now() - new Date(ultimo).getTime() < INTERVALO_MS) {
    logWarn('painel.recuperacao_em_intervalo', { tenant: tenant.slug })
    return resposta
  }

  const destino = `${await painelOrigin(service, tenant)}/admin/definir-senha`
  const { data, error: erroLink } = await service.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: destino },
  })
  const link = linkDeAcesso(destino, data?.properties)
  if (erroLink || !link) {
    logError('painel.recuperacao_link_falhou', { tenant: tenant.slug, reason: erroLink?.message })
    return resposta
  }

  await service.from('tenant_members').update({ last_recovery_at: new Date().toISOString() }).eq('id', membro.id)

  try {
    await enviarEmail({
      para: email,
      ...emailRecuperacaoSenhaPainel({ nomeImobiliaria: tenant.name, link }),
      remetente: { nome: tenant.name, endereco: await remetenteDoTenant(tenant), replyTo: tenant.email },
    })
  } catch (e) {
    logWarn('painel.recuperacao_envio_falhou', { tenant: tenant.slug, reason: errMessage(e) })
  }
  return resposta
})
