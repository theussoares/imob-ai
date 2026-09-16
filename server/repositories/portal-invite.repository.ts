import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~~/shared/types/database.types'
import type { PortalUser, PortalUserInput } from '~~/shared/models/portal'
import { toPortalUserModel, toPortalUserRow } from '~~/server/mappers/portal-user.mapper'
import {
  emailAcessoLiberado,
  emailConvitePortal,
  type CorpoEmail,
} from '~~/server/utils/email-templates'
import { enviarEmail } from '~~/server/utils/mailer'

type Client = SupabaseClient<Database>

export interface ResultadoConvite {
  cliente: PortalUser
  /** Já era cliente deste tenant: isto foi reenvio, não cadastro novo. */
  jaEraCliente: boolean
  /**
   * O e-mail já tinha conta na plataforma e essa conta NÃO era cliente deste
   * tenant — então o aviso enviado é sem token. A tela precisa dizer isso.
   */
  contaPreexistente: boolean
  /** O e-mail foi realmente despachado. */
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
  /** Link de definir senha. Só existe quando a conta nasceu agora. */
  linkConvite: string | null
  /** A conta já existia na plataforma antes deste convite. */
  preexistente: boolean
}

/**
 * O id no Auth, criando a conta se ainda não houver.
 *
 * `generateLink({type:'invite'})` cria o usuário E devolve o link. Quando o
 * e-mail já tem conta ele recusa — e é esse erro que distingue os dois casos.
 */
async function obterAcesso(service: Client, email: string, redirectTo: string): Promise<Acesso> {
  const { data, error } = await service.auth.admin.generateLink({
    type: 'invite',
    email,
    options: { redirectTo },
  })

  if (!error && data?.user?.id) {
    return {
      userId: data.user.id,
      linkConvite: data.properties?.action_link ?? null,
      preexistente: false,
    }
  }

  const userId = await acharUsuarioPorEmail(service, email)
  if (!userId) {
    throw createError({
      statusCode: 502,
      statusMessage: 'Não foi possível criar o convite. Tente novamente.',
    })
  }
  return { userId, linkConvite: null, preexistente: true }
}

/**
 * Link de redefinição — só para quem JÁ é cliente deste tenant.
 *
 * ⚠️ Nunca chamar para um e-mail que não seja cliente confirmado desta
 * imobiliária. Ver a nota grande em `convidarClientePortal`.
 */
async function linkDeRedefinicao(
  service: Client,
  email: string,
  redirectTo: string,
): Promise<string | null> {
  const { data } = await service.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo },
  })
  return data?.properties?.action_link ?? null
}

/**
 * Cadastra um cliente do portal e manda o aviso de acesso. Serve de reenvio.
 *
 * ⚠️ **QUANDO UM TOKEN É GERADO — a regra que sustenta este arquivo.**
 *
 * Só em dois casos:
 *   1. a conta nasceu agora (o e-mail não existia na plataforma); ou
 *   2. o e-mail JÁ é cliente deste tenant, e isto é reenvio.
 *
 * No terceiro caso — e-mail com conta preexistente que ainda não era cliente
 * desta imobiliária — o aviso vai **sem token nenhum**.
 *
 * O motivo: gerar um link de redefinição aí permitiria que qualquer membro de
 * qualquer tenant forçasse a troca de senha de uma conta alheia, apenas
 * digitando o e-mail no painel. Pior: o aviso sai do domínio verificado da
 * plataforma, com o nome de exibição e o Reply-To vindos de `tenant.name` e
 * `tenant.email`, que a própria imobiliária edita. Isso transforma o convite
 * numa ferramenta de phishing autêntica contra qualquer endereço — inclusive
 * o admin de um concorrente, que usa o MESMO `auth.users`.
 *
 * É a mesma preocupação que `member.repository.ts` documenta e recusa. A versão
 * anterior deste arquivo achou que mandar por e-mail bastava para eliminá-la;
 * bastava para evitar que QUEM CONVIDA roubasse a conta, não para evitar o
 * reset forçado nem o phishing com remetente confiável.
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
  urlPortal: string,
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

  // A decisão do token, explícita. Ver a nota acima.
  let corpo: CorpoEmail
  if (acesso.linkConvite) {
    // Caso 1: a conta nasceu agora.
    corpo = emailConvitePortal({
      nomeCliente: cliente.name,
      nomeImobiliaria: tenantNome,
      link: acesso.linkConvite,
    })
  } else if (existente) {
    // Caso 2: reenvio para quem já é cliente deste tenant.
    const link = await linkDeRedefinicao(service, email, redirectTo)
    corpo = link
      ? emailConvitePortal({ nomeCliente: cliente.name, nomeImobiliaria: tenantNome, link })
      : emailAcessoLiberado({ nomeCliente: cliente.name, nomeImobiliaria: tenantNome, urlPortal })
  } else {
    // Caso 3: conta preexistente de terceiro. NENHUM token.
    logWarn('portal.convite_sem_token', { tenant: tenantId, motivo: 'conta_preexistente' })
    corpo = emailAcessoLiberado({
      nomeCliente: cliente.name,
      nomeImobiliaria: tenantNome,
      urlPortal,
    })
  }

  let emailEnviado = false
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
    // perderia o vínculo recém-criado, e o reenvio resolve. Mas a tela precisa
    // saber que o e-mail não saiu, senão a imobiliária fica esperando um
    // cliente que nunca foi avisado.
    logWarn('portal.convite_envio_falhou', { tenant: tenantId, reason: errMessage(e) })
  }

  return {
    cliente,
    jaEraCliente: !!existente,
    contaPreexistente: acesso.preexistente && !existente,
    emailEnviado,
  }
}
