import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~~/shared/types/database.types'

type Client = SupabaseClient<Database>

/** Aceita o suficiente para não deixar passar erro de digitação óbvio. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export interface MemberView {
  id: string
  userId: string
  email: string
  role: string
  /** Convidado, mas ainda não confirmou o e-mail / definiu a senha. */
  pending: boolean
  createdAt: string
}

export interface InviteResult {
  /**
   * Link para a pessoa definir a senha. `null` quando o e-mail já tinha conta —
   * ver a nota de segurança em `inviteMember`.
   */
  inviteLink: string | null
  alreadyRegistered: boolean
  alreadyMember: boolean
  email: string
}

/**
 * Convida um e-mail para o painel deste tenant.
 *
 * Exige o client de service role: `tenant_members` não tem policy de insert, e a
 * API de admin do Auth também não responde à chave pública.
 *
 * ⚠️ Quando o e-mail JÁ tem conta, nenhum link é devolvido. Seria cômodo mandar
 * um magic link para a pessoa entrar — e é escalação de privilégio: se aquele
 * e-mail pertence a um membro de OUTRA imobiliária, quem convidou clicaria no
 * link e entraria como ele, enxergando os dados do outro cliente. Nesse caso
 * criamos só o vínculo; a pessoa entra pelo login normal, com a senha dela.
 */
export async function inviteMember(
  service: Client,
  tenantId: string,
  rawEmail: string,
  redirectTo: string,
): Promise<InviteResult> {
  const email = rawEmail.trim().toLowerCase()
  if (!EMAIL_RE.test(email)) {
    throw createError({ statusCode: 422, statusMessage: 'E-mail inválido.' })
  }

  // Tentar criar já responde as duas perguntas (existe? qual o id?) numa chamada
  // só — o GoTrue recusa e-mail cadastrado, e é esse erro que distingue os casos.
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

  const { data: existing } = await service
    .from('tenant_members')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .maybeSingle()

  if (existing) {
    return { inviteLink: null, alreadyRegistered, alreadyMember: true, email }
  }

  const { error: insertError } = await service.from('tenant_members').insert({ tenant_id: tenantId, user_id: userId })
  if (insertError) throw insertError

  return { inviteLink, alreadyRegistered, alreadyMember: false, email }
}

/**
 * Remove o acesso de um membro.
 *
 * `memberId` vem da URL, então o filtro por tenant não é otimização: sem ele,
 * quem descobrisse um id alheio removeria o acesso de outro cliente.
 */
export async function removeMember(
  service: Client,
  tenantId: string,
  memberId: string,
  callerUserId: string,
): Promise<void> {
  const { data: member } = await service
    .from('tenant_members')
    .select('id, user_id')
    .eq('tenant_id', tenantId)
    .eq('id', memberId)
    .maybeSingle()

  if (!member) {
    throw createError({ statusCode: 404, statusMessage: 'Membro não encontrado.' })
  }

  if (member.user_id === callerUserId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Você não pode remover o seu próprio acesso.',
    })
  }

  const { data: all } = await service.from('tenant_members').select('id').eq('tenant_id', tenantId)
  if ((all ?? []).length <= 1) {
    // Remover o último tranca a imobiliária fora do próprio painel, e só um SQL
    // manual destrava.
    throw createError({
      statusCode: 409,
      statusMessage: 'Não é possível remover o último acesso da imobiliária.',
    })
  }

  const { error } = await service.from('tenant_members').delete().eq('tenant_id', tenantId).eq('id', memberId)
  if (error) throw error
}

/**
 * Procura o id do usuário pelo e-mail.
 *
 * A API de admin do Auth não filtra por e-mail, então percorre as páginas. É
 * aceitável no tamanho atual (dezenas de usuários no projeto inteiro) e vira
 * problema se a base crescer muito — aí o caminho é guardar o e-mail junto do
 * vínculo em vez de perguntar ao Auth.
 */
async function findUserIdByEmail(service: Client, email: string): Promise<string | null> {
  const { data } = await service.auth.admin.listUsers()
  const found = data?.users?.find((u) => (u.email ?? '').toLowerCase() === email)
  return found?.id ?? null
}

/**
 * Membros deste tenant, com o e-mail de cada um.
 *
 * `tenant_members` guarda só o `user_id`; o e-mail vive no schema `auth`, que o
 * PostgREST não expõe. Por isso a lista de usuários vem pela API de admin e o
 * cruzamento acontece aqui.
 *
 * O filtro por tenant é obrigatório e não é redundante: este client é service
 * role, então a RLS não protege nada — a query é a única barreira entre os
 * clientes.
 */
export async function listMembers(service: Client, tenantId: string): Promise<MemberView[]> {
  const { data: rows, error } = await service
    .from('tenant_members')
    .select('id, user_id, role, created_at')
    .eq('tenant_id', tenantId)
  if (error) throw error
  if (!rows?.length) return []

  const { data: authData } = await service.auth.admin.listUsers()
  const byId = new Map((authData?.users ?? []).map((u) => [u.id, u]))

  return rows.map((r) => {
    const u = byId.get(r.user_id)
    return {
      id: r.id,
      userId: r.user_id,
      // Usuário removido direto no dashboard deixaria o vínculo órfão; mostrar
      // o aviso é melhor que uma linha em branco sem explicação.
      email: u?.email ?? '(usuário removido)',
      role: r.role,
      pending: !u?.email_confirmed_at,
      createdAt: r.created_at,
    }
  })
}
