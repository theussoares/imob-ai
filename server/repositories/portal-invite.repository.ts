import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~~/shared/types/database.types'
import type { PortalUserInput } from '~~/shared/models/portal'

type Client = SupabaseClient<Database>

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export interface PortalInviteResult {
  /**
   * Link para a pessoa definir a senha. `null` quando o e-mail já tinha conta —
   * ver a nota de segurança abaixo.
   */
  inviteLink: string | null
  alreadyRegistered: boolean
  alreadyClient: boolean
  email: string
}

/**
 * Convida um cliente (inquilino/proprietário/fiador) para o portal deste tenant.
 *
 * Exige service role: `portal_users` não tem policy de insert para ninguém, e a
 * API de admin do Auth também não responde à chave pública.
 *
 * ⚠️ QUANDO O E-MAIL JÁ TEM CONTA, NENHUM LINK É DEVOLVIDO.
 *
 * Mesma armadilha documentada em `member.repository.ts`, e aqui ela é pior.
 * Seria cômodo mandar um magic link para a pessoa entrar — e é escalação de
 * privilégio: quem convidou clicaria no link e entraria COMO ela. Num portal de
 * locação isso significa ler o contrato e os comprovantes de um terceiro.
 *
 * E o cenário não é hipotético: o mesmo e-mail pode já ser de um membro de
 * painel, de um cliente de outra imobiliária, ou do próprio corretor testando.
 * Nesses casos criamos só o vínculo; a pessoa entra pelo login normal, com a
 * senha que já tem.
 */
export async function invitePortalUser(
  service: Client,
  tenantId: string,
  input: PortalUserInput,
  redirectTo: string,
): Promise<PortalInviteResult> {
  const email = input.email.trim().toLowerCase()
  if (!EMAIL_RE.test(email)) {
    throw createError({ statusCode: 422, statusMessage: 'E-mail inválido.' })
  }
  const name = input.name.trim()
  if (!name) {
    throw createError({ statusCode: 422, statusMessage: 'Nome é obrigatório.' })
  }

  // Tentar criar responde duas perguntas numa chamada só (existe? qual o id?) —
  // o GoTrue recusa e-mail cadastrado, e é esse erro que distingue os casos.
  const { data, error } = await service.auth.admin.generateLink({
    type: 'invite',
    email,
    options: { redirectTo },
  })

  let userId: string
  let inviteLink: string | null = null
  let alreadyRegistered = false

  if (error || !data?.user) {
    alreadyRegistered = true
    const found = await findUserIdByEmail(service, email)
    if (!found) {
      // Falhou por outro motivo que não "já cadastrado".
      throw createError({
        statusCode: 502,
        statusMessage: 'Não foi possível criar o convite. Tente novamente.',
      })
    }
    userId = found
  } else {
    userId = data.user.id
    inviteLink = data.properties?.action_link ?? null
  }

  // Já é cliente desta imobiliária? Então o convite é reenvio, não cadastro
  // novo — e o vínculo não pode ser duplicado.
  const { data: existing } = await service
    .from('portal_users')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .maybeSingle()

  if (existing) {
    return { inviteLink, alreadyRegistered, alreadyClient: true, email }
  }

  const { error: insertError } = await service.from('portal_users').insert({
    tenant_id: tenantId,
    user_id: userId,
    name,
    email,
    doc: input.doc?.trim() || null,
    phone: input.phone?.trim() || null,
  })

  // Índice único é (tenant_id, lower(email)): o mesmo e-mail com OUTRA conta de
  // Auth no mesmo tenant. Acontece quando alguém troca de e-mail e volta.
  if (insertError?.code === '23505') {
    throw createError({
      statusCode: 409,
      statusMessage: 'Já existe um cliente com este e-mail nesta imobiliária.',
    })
  }
  if (insertError) throw insertError

  return { inviteLink, alreadyRegistered, alreadyClient: false, email }
}

/**
 * Procura o id do usuário pelo e-mail.
 *
 * A API de admin do Auth não filtra por e-mail, então percorre as páginas —
 * mesma limitação já anotada em `member.repository.ts`. Aceitável no tamanho
 * atual; vira problema quando a base de clientes crescer, e aí o caminho é
 * guardar o e-mail junto do vínculo em vez de perguntar ao Auth.
 */
async function findUserIdByEmail(service: Client, email: string): Promise<string | null> {
  const { data } = await service.auth.admin.listUsers()
  const found = data?.users?.find((u) => (u.email ?? '').toLowerCase() === email)
  return found?.id ?? null
}
