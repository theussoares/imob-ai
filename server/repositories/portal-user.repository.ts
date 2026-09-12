import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~~/shared/types/database.types'
import type { PortalUser, PortalUserInput } from '~~/shared/models/portal'
import { toPortalUserModel } from '~~/server/mappers/portal-user.mapper'

type Client = SupabaseClient<Database>

/** Aceita o suficiente para não deixar passar erro de digitação óbvio. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/** Clientes do portal desta imobiliária. */
export async function listPortalUsers(client: Client, tenantId: string): Promise<PortalUser[]> {
  const { data, error } = await client
    .from('portal_users')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('name', { ascending: true })
  if (error) throw error
  return (data ?? []).map(toPortalUserModel)
}

/**
 * Cria o vínculo do cliente com esta imobiliária.
 *
 * `userId` vem de quem já resolveu a conta no Auth (o fluxo de convite, card
 * 0.5) — este repositório não fala com o GoTrue. Separação deliberada: convidar
 * envolve service role e link de senha, e misturar isso aqui faria a função
 * precisar de privilégio que a listagem não precisa.
 */
export async function createPortalUser(
  client: Client,
  tenantId: string,
  userId: string,
  input: PortalUserInput,
): Promise<PortalUser> {
  const email = input.email.trim().toLowerCase()
  if (!EMAIL_RE.test(email)) {
    throw createError({ statusCode: 422, statusMessage: 'E-mail inválido.' })
  }
  if (!input.name.trim()) {
    throw createError({ statusCode: 422, statusMessage: 'Nome é obrigatório.' })
  }

  const { data, error } = await client
    .from('portal_users')
    .insert({
      tenant_id: tenantId,
      user_id: userId,
      name: input.name.trim(),
      email,
      doc: input.doc?.trim() || null,
      phone: input.phone?.trim() || null,
    })
    .select('*')
    .single()

  // 23505 é unique_violation. O índice é (tenant_id, lower(email)): duas contas
  // com o mesmo e-mail na mesma imobiliária seriam duas caixas de entrada
  // disputando o mesmo contrato, e o suporte não teria como saber qual é a boa.
  if (error?.code === '23505') {
    throw createError({
      statusCode: 409,
      statusMessage: 'Já existe um cliente com este e-mail nesta imobiliária.',
    })
  }
  if (error) throw error
  return toPortalUserModel(data)
}

/**
 * Liga ou desliga o acesso.
 *
 * Desativar NÃO apaga histórico: a trilha de quem baixou o quê continua de pé,
 * que é o que responde "quem acessou meu contrato?" depois de a pessoa sair.
 */
export async function setPortalUserActive(
  client: Client,
  tenantId: string,
  id: string,
  active: boolean,
): Promise<void> {
  const { error } = await client
    .from('portal_users')
    .update({ active })
    .eq('tenant_id', tenantId)
    .eq('id', id)
  if (error) throw error
}
