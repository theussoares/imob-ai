import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~~/shared/types/database.types'
import type { PortalUser, PortalUserInput } from '~~/shared/models/portal'
import { toPortalUserModel, toPortalUserRow } from '~~/server/mappers/portal-user.mapper'
import { emailConvitePortal } from '~~/server/utils/email-templates'
import { enviarEmail } from '~~/server/utils/mailer'

type Client = SupabaseClient<Database>

export interface ResultadoConvite {
  cliente: PortalUser
  /** Já era cliente deste tenant: isto foi reenvio, não cadastro novo. */
  jaEraCliente: boolean
  /** O convite foi realmente despachado. */
  emailEnviado: boolean
}

/** Acha o usuário do Auth por e-mail, quando `generateLink` recusa por já existir. */
async function acharUsuarioPorEmail(service: Client, email: string): Promise<string | null> {
  // A API de admin pagina. A carteira é pequena, mas varrer sem teto viraria um
  // laço infinito no dia em que a base crescer.
  for (let pagina = 1; pagina <= 10; pagina++) {
    const { data, error } = await service.auth.admin.listUsers({ page: pagina, perPage: 200 })
    if (error || !data?.users?.length) return null
    const achado = data.users.find((u) => (u.email || '').toLowerCase() === email)
    if (achado) return achado.id
    if (data.users.length < 200) return null
  }
  return null
}

interface Acesso {
  userId: string
  link: string | null
}

/**
 * O id no Auth e um link para a pessoa definir a senha.
 *
 * Dois caminhos, porque `generateLink({type:'invite'})` **recusa e-mail que já
 * tem conta** — e conta já existente é o caso comum aqui: a mesma pessoa pode
 * ser cliente de duas imobiliárias, e o reenvio de convite acontece depois de o
 * primeiro já ter criado o usuário.
 *
 * Para quem já tem conta o tipo certo é `recovery`: ele funciona em conta
 * existente e leva à mesma tela de definir senha.
 */
async function obterAcesso(service: Client, email: string, redirectTo: string): Promise<Acesso> {
  const { data, error } = await service.auth.admin.generateLink({
    type: 'invite',
    email,
    options: { redirectTo },
  })

  if (!error && data?.user?.id) {
    return { userId: data.user.id, link: data.properties?.action_link ?? null }
  }

  const userId = await acharUsuarioPorEmail(service, email)
  if (!userId) {
    throw createError({
      statusCode: 502,
      statusMessage: 'Não foi possível criar o convite. Tente novamente.',
    })
  }

  const { data: rec } = await service.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo },
  })
  return { userId, link: rec?.properties?.action_link ?? null }
}

/**
 * Cadastra um cliente do portal e manda o convite. Serve também de reenvio.
 *
 * ⚠️ **O link NUNCA volta para quem convidou — ele só vai para a caixa de
 * entrada do convidado.** É o que separa este fluxo do convite do painel
 * (`member.repository.ts`), que devolve um link copiável porque foi escrito
 * antes de existir mailer, e por isso precisa recusar link quando o e-mail já
 * tem conta: lá, entregar um link de conta alheia a quem convidou é escalação
 * de privilégio — a pessoa clicaria e entraria COMO o dono do e-mail.
 *
 * Mandando por e-mail, esse risco não existe: o link só chega a quem controla
 * a caixa. É o que permite tratar conta existente normalmente aqui, em vez de
 * deixar a pessoa sem convite.
 *
 * Exige service role: `portal_users` não aceita insert de quem não é membro, e
 * a API de admin do Auth não responde à chave pública.
 */
export async function convidarClientePortal(
  service: Client,
  tenantId: string,
  tenantNome: string,
  tenantEmail: string | null,
  input: PortalUserInput,
  redirectTo: string,
): Promise<ResultadoConvite> {
  const email = input.email.trim().toLowerCase()

  // Já é cliente DESTE tenant? Então é reenvio — o índice único
  // (tenant_id, lower(email)) recusaria um insert novo com 23505.
  const { data: existente } = await service
    .from('portal_users')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('email', email)
    .maybeSingle()

  const acesso = await obterAcesso(service, email, redirectTo)

  let cliente: PortalUser
  if (existente) {
    cliente = toPortalUserModel(existente)
  } else {
    const { data: criado, error } = await service
      .from('portal_users')
      .insert(toPortalUserRow(input, tenantId, acesso.userId))
      .select('*')
      .single()

    if ((error as { code?: string } | null)?.code === '23505') {
      // Corrida entre duas abas do painel. Não é erro de quem cadastrou.
      throw createError({
        statusCode: 409,
        statusMessage: `${email} já está cadastrado nesta imobiliária.`,
      })
    }
    if (error) throw error
    cliente = toPortalUserModel(criado)
  }

  let emailEnviado = false
  if (acesso.link) {
    const corpo = emailConvitePortal({
      nomeCliente: cliente.name,
      nomeImobiliaria: tenantNome,
      link: acesso.link,
    })
    try {
      const r = await enviarEmail({
        para: email,
        assunto: corpo.assunto,
        html: corpo.html,
        texto: corpo.texto,
        remetente: { nome: tenantNome, replyTo: tenantEmail },
      })
      emailEnviado = r.enviado
    } catch (e) {
      // O cadastro já está feito e não é desfeito por falha de envio: desfazer
      // perderia o vínculo recém-criado, e o reenvio resolve. Mas a tela
      // precisa saber que o e-mail não saiu, senão a imobiliária fica
      // esperando um cliente que nunca foi avisado.
      logWarn('portal.convite_envio_falhou', { tenant: tenantId, reason: errMessage(e) })
    }
  }

  return { cliente, jaEraCliente: !!existente, emailEnviado }
}
