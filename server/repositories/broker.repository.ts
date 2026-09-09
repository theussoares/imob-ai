import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~~/shared/types/database.types'
import type { Broker, BrokerInput } from '~~/shared/models/broker'
import { toBrokerModel, toBrokerRow } from '~~/server/mappers/broker.mapper'
import { inviteMember } from '~~/server/repositories/member.repository'

type Client = SupabaseClient<Database>

export async function listBrokers(client: Client, tenantId: string): Promise<Broker[]> {
  const { data, error } = await client
    .from('brokers')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('name', { ascending: true })
  if (error) throw error
  return (data ?? []).map(toBrokerModel)
}

export async function getBroker(client: Client, tenantId: string, id: string): Promise<Broker | null> {
  const { data, error } = await client
    .from('brokers')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data ? toBrokerModel(data) : null
}

export async function createBroker(client: Client, tenantId: string, input: BrokerInput): Promise<Broker> {
  const { data, error } = await client.from('brokers').insert(toBrokerRow(input, tenantId)).select('*').single()
  if (error) throw error
  return toBrokerModel(data)
}

export async function updateBroker(
  client: Client,
  tenantId: string,
  id: string,
  input: BrokerInput,
): Promise<Broker> {
  const { data, error } = await client
    .from('brokers')
    .update(toBrokerRow(input, tenantId))
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return toBrokerModel(data)
}

export async function deleteBroker(client: Client, tenantId: string, id: string): Promise<void> {
  const { error } = await client.from('brokers').delete().eq('tenant_id', tenantId).eq('id', id)
  if (error) throw error
}

export interface GrantAccessResult {
  /** Link para definir a senha. `null` se o e-mail já tinha conta (ver `inviteMember`). */
  inviteLink: string | null
  email: string
  alreadyRegistered: boolean
}

/**
 * Dá ao corretor acesso ao painel: convida o e-mail do cadastro e liga a conta
 * criada a este `brokers.id`.
 *
 * As duas metades precisam andar juntas. Só convidar cria um membro com papel de
 * corretor e nenhuma carteira — `current_broker_id` devolve null e o funil abre
 * vazio. Só ligar `user_id` aponta para uma conta que não é membro do tenant, e
 * a RLS recusa tudo. Nenhum dos dois estados é útil, então ambos ficam aqui.
 *
 * Exige service role: convidar mexe na API de admin do Auth e em
 * `tenant_members`, que não tem policy de insert.
 */
export async function grantBrokerPanelAccess(
  service: Client,
  tenantId: string,
  brokerId: string,
  redirectTo: string,
): Promise<GrantAccessResult> {
  // O filtro por tenant não é otimização: `brokerId` vem da URL, e sem ele quem
  // descobrisse um id alheio daria acesso ao painel de outro cliente.
  const { data: broker, error } = await service
    .from('brokers')
    .select('id, email, user_id')
    .eq('tenant_id', tenantId)
    .eq('id', brokerId)
    .maybeSingle()
  if (error) throw error
  if (!broker) {
    throw createError({ statusCode: 404, statusMessage: 'Corretor não encontrado.' })
  }
  if (broker.user_id) {
    throw createError({ statusCode: 409, statusMessage: 'Este corretor já tem acesso ao painel.' })
  }
  if (!broker.email) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Cadastre o e-mail do corretor antes de dar acesso ao painel.',
    })
  }

  const invite = await inviteMember(service, tenantId, broker.email, redirectTo, 'broker')

  const { error: linkError } = await service
    .from('brokers')
    .update({ user_id: invite.userId })
    .eq('tenant_id', tenantId)
    .eq('id', brokerId)

  if (linkError) {
    // O índice único (tenant_id, user_id) da 0029 barra o mesmo login em dois
    // cadastros. Acontece de verdade: dois cadastros do mesmo corretor, com o
    // mesmo e-mail. A mensagem crua do Postgres não ajudaria quem está na tela.
    if (linkError.code === '23505') {
      throw createError({
        statusCode: 409,
        statusMessage: 'Este e-mail já está ligado a outro corretor desta imobiliária.',
      })
    }
    throw linkError
  }

  return { inviteLink: invite.inviteLink, email: invite.email, alreadyRegistered: invite.alreadyRegistered }
}

/**
 * Tira o acesso ao painel, desfazendo as duas metades de `grantBrokerPanelAccess`.
 *
 * O cadastro do corretor continua existindo — some o login, não a pessoa. Os
 * leads dele seguem atribuídos: reatribuir é decisão de quem administra, e fazer
 * isso aqui em silêncio esconderia trabalho em andamento.
 */
export async function revokeBrokerPanelAccess(
  service: Client,
  tenantId: string,
  brokerId: string,
  callerUserId: string,
): Promise<void> {
  const { data: broker, error } = await service
    .from('brokers')
    .select('id, user_id')
    .eq('tenant_id', tenantId)
    .eq('id', brokerId)
    .maybeSingle()
  if (error) throw error
  if (!broker) {
    throw createError({ statusCode: 404, statusMessage: 'Corretor não encontrado.' })
  }
  if (!broker.user_id) return

  if (broker.user_id === callerUserId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Você não pode remover o seu próprio acesso.',
    })
  }

  // Desliga primeiro: se a remoção do vínculo falhar no meio, sobra um membro
  // sem carteira (inofensivo) em vez de um cadastro apontando para quem não é
  // mais membro.
  const { error: unlinkError } = await service
    .from('brokers')
    .update({ user_id: null })
    .eq('tenant_id', tenantId)
    .eq('id', brokerId)
  if (unlinkError) throw unlinkError

  const { error: memberError } = await service
    .from('tenant_members')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('user_id', broker.user_id)
  if (memberError) throw memberError
}
