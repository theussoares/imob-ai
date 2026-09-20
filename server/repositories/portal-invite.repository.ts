import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~~/shared/types/database.types'
import type { PortalUser, PortalUserInput } from '~~/shared/models/portal'
import { toPortalUserModel, toPortalUserRow } from '~~/server/mappers/portal-user.mapper'
import {
  emailAcessoLiberado,
  emailConvitePortal,
  type CorpoEmail,
} from '~~/server/utils/email-templates'
import { enviarEmail, type Remetente } from '~~/server/utils/mailer'

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
  /**
   * O aviso saiu sem link de senha. Vale também para o REENVIO de um cadastro
   * que nasceu de conta preexistente e a pessoa ainda não confirmou entrando —
   * aí o aviso é sem token de novo, e a tela não pode prometer um link.
   */
  semToken: boolean
  /** O e-mail foi realmente despachado. */
  emailEnviado: boolean
  /**
   * Por que não saiu, quando não saiu. `null` quando saiu.
   *
   * Existe porque a tela não tem como adivinhar: antes disto o `catch` abaixo
   * engolia a causa num log e devolvia só `emailEnviado: false`, e a única frase
   * possível virava "tente de novo em instantes" — que é **mentira** quando a
   * causa é configuração. Quem clicou tenta de novo, falha de novo, e não
   * descobre que o problema não é dele.
   *
   * Dois valores e não a mensagem pronta: a decisão de como dizer é da tela, e
   * mandar texto do servidor para o painel espalha copy por duas camadas.
   *
   *   - `nao_configurado`: falta chave ou remetente. Tentar de novo não resolve
   *     nada, e o problema é da PLATAFORMA, não da imobiliária.
   *   - `provedor`: o provedor recusou o envio. Aí tentar de novo faz sentido.
   */
  motivoFalha: 'nao_configurado' | 'provedor' | null
}

/**
 * Traduz a falha de envio no motivo que a tela precisa.
 *
 * O `mailer` já separa os dois casos por status: 500 para "não configurado"
 * (erra alto de propósito, porque convite que não sai precisa falhar visível) e
 * 502 para o provedor ter recusado. Qualquer outra coisa é tratada como
 * provedor: é o lado que sugere tentar de novo, e sugerir uma tentativa a mais
 * custa menos que afirmar "é problema nosso" sobre um erro que não conhecemos.
 */
function motivoDaFalha(e: unknown): 'nao_configurado' | 'provedor' {
  return (e as { statusCode?: number })?.statusCode === 500 ? 'nao_configurado' : 'provedor'
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

/**
 * Esta conta do Auth é membro do painel de ALGUMA imobiliária?
 *
 * Conta de equipe e conta de cliente compartilham o mesmo `auth.users`. Deixar
 * uma imobiliária cadastrar como "cliente" o operador de outra significa criar,
 * sem pedir nada a ele, um vínculo com nome, CPF e telefone digitados por
 * terceiro — e um caminho para ele ser posto como parte de contratos que não
 * são dele. O acesso ao painel dele não é afetado, mas o cadastro é um dado
 * pessoal que ninguém autorizou.
 */
async function ehMembroDePainel(service: Client, userId: string): Promise<boolean> {
  const { data } = await service
    .from('tenant_members')
    .select('id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle()
  return !!data
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
 * ⚠️ Nunca chamar para um e-mail que não seja cliente **com vínculo
 * confirmado** desta imobiliária — existir linha em `portal_users` não basta.
 * Ver a nota grande em `convidarClientePortal`.
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
 *   2. o e-mail já é cliente deste tenant **com vínculo confirmado**, e isto é
 *      reenvio.
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
 * ⚠️ **O "confirmado" do caso 2 não é detalhe: sem ele o caso 3 não é terminal.**
 * A linha em `portal_users` é inserida em TODOS os casos, inclusive no 3 — é ela
 * que permite pôr a pessoa como parte de um contrato. Se a decisão do token
 * olhasse só para a existência da linha, bastaria convidar duas vezes: a
 * primeira chamada criaria a linha (aviso sem token, como desenhado) e a
 * segunda se julgaria reenvio, gerando o `recovery` de verdade para a caixa da
 * vítima. Era assim até a revisão do PR #26.
 *
 * Por isso a guarda olha COMO a linha nasceu, e não se ela existe:
 * `access_confirmed_at` (0037) só é preenchido quando a conta nasceu deste
 * convite ou quando a própria pessoa entrou no portal desta imobiliária —
 * `requirePortalUser` grava. Nulo = aviso sem token, sempre.
 *
 * O que ainda fica de pé, e é limite do desenho e não descuido: a conta criada
 * no caso 1 é do `auth.users` compartilhado, então quem convidou mantém o poder
 * de reemitir link para ela. Separar isso exigiria identidade por tenant.
 *
 * Exige service role: `portal_users` não aceita insert de quem não é membro, e
 * a API de admin do Auth não responde à chave pública.
 */
export async function convidarClientePortal(
  service: Client,
  tenantId: string,
  // O remetente inteiro, e não nome/e-mail soltos: a assinatura já tinha sete
  // posicionais, e um terceiro `string` adjacente tornaria uma troca de ordem
  // invisível para o compilador.
  remetente: Remetente,
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

  // Conta de equipe não vira cadastro de cliente por iniciativa de terceiro.
  // Só vale para cadastro NOVO: se a pessoa já é cliente deste tenant, o
  // vínculo já existe e recusar agora quebraria o reenvio sem proteger nada.
  //
  // A mensagem não diz que a conta é administrativa — quem cadastra não precisa
  // descobrir, pelo erro, que aquele endereço é de equipe em algum lugar.
  if (!existente && (await ehMembroDePainel(service, acesso.userId))) {
    logWarn('portal.cadastro_recusado', { tenant: tenantId, motivo: 'conta_de_equipe' })
    throw createError({
      statusCode: 409,
      statusMessage:
        'Este e-mail não pode receber acesso de cliente. Peça ao cliente um endereço pessoal.',
    })
  }

  let cliente: PortalUser
  if (existente) {
    cliente = toPortalUserModel(existente)
  } else {
    const { data: criado, error } = await service
      .from('portal_users')
      .insert({
        ...toPortalUserRow(input, tenantId, acesso.userId),
        // O vínculo nasce confirmado só quando a conta nasceu AQUI: não há
        // conta de terceiro para sequestrar. Vindo de conta preexistente fica
        // nulo, e nenhum reenvio produz token até a pessoa entrar. É a decisão
        // de segurança da nota acima, e por isso fica aqui e não no mapper.
        access_confirmed_at: acesso.preexistente ? null : new Date().toISOString(),
      })
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
  //
  // `vinculoConfirmado` é o que separa o reenvio legítimo da escalada: a linha
  // existir não diz nada, porque o caso 3 também cria linha.
  const vinculoConfirmado = !!existente?.access_confirmed_at

  let corpo: CorpoEmail
  let semToken = false
  if (acesso.linkConvite) {
    // Caso 1: a conta nasceu agora.
    corpo = emailConvitePortal({
      nomeCliente: cliente.name,
      nomeImobiliaria: remetente.nome,
      link: acesso.linkConvite,
    })
  } else if (vinculoConfirmado) {
    // Caso 2: reenvio para quem já é cliente confirmado deste tenant.
    const link = await linkDeRedefinicao(service, email, redirectTo)
    semToken = !link
    corpo = link
      ? emailConvitePortal({ nomeCliente: cliente.name, nomeImobiliaria: remetente.nome, link })
      : emailAcessoLiberado({ nomeCliente: cliente.name, nomeImobiliaria: remetente.nome, urlPortal })
  } else {
    // Caso 3: conta preexistente de terceiro, ou reenvio de um cadastro que
    // nasceu assim e ninguém confirmou. NENHUM token, quantas vezes for.
    semToken = true
    logWarn('portal.convite_sem_token', {
      tenant: tenantId,
      motivo: existente ? 'vinculo_nao_confirmado' : 'conta_preexistente',
    })
    corpo = emailAcessoLiberado({
      nomeCliente: cliente.name,
      nomeImobiliaria: remetente.nome,
      urlPortal,
    })
  }

  let emailEnviado = false
  let motivoFalha: 'nao_configurado' | 'provedor' | null = null
  try {
    const r = await enviarEmail({
      para: email,
      assunto: corpo.assunto,
      html: corpo.html,
      texto: corpo.texto,
      remetente,
    })
    emailEnviado = r.enviado
    // `enviado: false` sem exceção é o caminho de fora de produção, e ele sai do
    // MESMO ramo de "sem chave ou sem remetente" — ou seja, a causa é a mesma
    // que o 500 sinaliza. Dizer `nao_configurado` aqui é preciso, não uma
    // aproximação.
    if (!emailEnviado) motivoFalha = 'nao_configurado'
  } catch (e) {
    motivoFalha = motivoDaFalha(e)
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
    semToken,
    emailEnviado,
    motivoFalha,
  }
}
