import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~~/shared/types/database.types'
import type {
  Contract,
  ContractForClient,
  ContractInput,
  ContractInternal,
  ContractInternalInput,
  ContractPartyRole,
} from '~~/shared/models/portal'
import { CONTRACT_PARTY_ROLES } from '~~/shared/models/portal'
import {
  toContractForClientModel,
  toContractInternalModel,
  toContractInternalRow,
  toContractModel,
  toContractRow,
} from '~~/server/mappers/contract.mapper'

type Client = SupabaseClient<Database>

// ---------------------------------------------------------------------------
// Lado do painel
// ---------------------------------------------------------------------------

export async function listContracts(client: Client, tenantId: string): Promise<Contract[]> {
  const { data, error } = await client
    .from('contracts')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(toContractModel)
}

export async function getContract(
  client: Client,
  tenantId: string,
  id: string,
): Promise<Contract | null> {
  const { data, error } = await client
    .from('contracts')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data ? toContractModel(data) : null
}

export async function createContract(
  client: Client,
  tenantId: string,
  input: ContractInput,
): Promise<Contract> {
  const { data, error } = await client
    .from('contracts')
    .insert(toContractRow(input, tenantId))
    .select('*')
    .single()
  if (error) throw error
  return toContractModel(data)
}

export async function updateContract(
  client: Client,
  tenantId: string,
  id: string,
  input: ContractInput,
): Promise<Contract> {
  const { data, error } = await client
    .from('contracts')
    .update(toContractRow(input, tenantId))
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return toContractModel(data)
}

/**
 * Campos internos do contrato. Vive em tabela própria (`contract_internal`) e é
 * lido só pelo painel — ver a nota da migration 0028 sobre por que não são
 * colunas de `contracts`.
 */
export async function getContractInternal(
  client: Client,
  contractId: string,
): Promise<ContractInternal | null> {
  const { data, error } = await client
    .from('contract_internal')
    .select('*')
    .eq('contract_id', contractId)
    .maybeSingle()
  if (error) throw error
  return data ? toContractInternalModel(data) : null
}

export async function upsertContractInternal(
  client: Client,
  contractId: string,
  input: ContractInternalInput,
): Promise<ContractInternal> {
  const { data, error } = await client
    .from('contract_internal')
    .upsert(toContractInternalRow(input, contractId), { onConflict: 'contract_id' })
    .select('*')
    .single()
  if (error) throw error
  return toContractInternalModel(data)
}

// ---------------------------------------------------------------------------
// Lado do cliente
// ---------------------------------------------------------------------------

/**
 * A row de contrato com os vínculos da pessoa que perguntou, embutidos pelo
 * PostgREST. `!inner` é o que transforma o embed em filtro: sem ele viriam
 * todos os contratos do tenant, cada um com uma lista de partes possivelmente
 * vazia — e "lista vazia" é fácil de confundir com "não é parte" no código de
 * cima.
 */
const CLIENT_CONTRACT_SELECT = '*, contract_parties!inner(role, portal_user_id)'

interface PartyRef {
  role: ContractPartyRole
  portal_user_id: string
}

/**
 * Os papéis desta pessoa NESTE contrato, em ordem canônica.
 *
 * Refiltra por `portal_user_id` mesmo com a query já filtrando: o `!inner`
 * decide quais contratos voltam, mas o Postgres pode devolver no embed as
 * outras partes daquele contrato. Sem este filtro, o inquilino receberia
 * `roles: ['inquilino', 'proprietario']` porque o dono também está no contrato
 * — e passaria a enxergar os documentos endereçados ao proprietário.
 */
function rolesOf(parties: PartyRef[] | null | undefined, portalUserId: string): ContractPartyRole[] {
  const meus = new Set((parties ?? []).filter((p) => p.portal_user_id === portalUserId).map((p) => p.role))
  return CONTRACT_PARTY_ROLES.filter((r) => meus.has(r))
}

/** Os contratos em que esta pessoa é parte, nesta imobiliária. */
export async function listContractsForClient(
  client: Client,
  tenantId: string,
  portalUserId: string,
): Promise<ContractForClient[]> {
  const { data, error } = await client
    .from('contracts')
    .select(CLIENT_CONTRACT_SELECT)
    .eq('tenant_id', tenantId)
    .eq('contract_parties.portal_user_id', portalUserId)
    .order('created_at', { ascending: false })
  if (error) throw error

  return (data ?? [])
    .map((row) => {
      const { contract_parties, ...contract } = row as typeof row & { contract_parties: PartyRef[] }
      return toContractForClientModel(contract, rolesOf(contract_parties, portalUserId))
    })
    // Sem papel não há o que mostrar, e mais importante: `roles: []` faz
    // `canClientSeeDocument` recusar tudo adiante. Some aqui para não virar um
    // contrato vazio e inexplicável na tela.
    .filter((c) => c.roles.length > 0)
}

/**
 * Um contrato específico, se esta pessoa for parte dele.
 *
 * Devolve `null` tanto para "não existe" quanto para "não é seu": quem pede o
 * id de um contrato alheio não pode descobrir pela resposta que ele existe.
 */
export async function getContractForClient(
  client: Client,
  tenantId: string,
  portalUserId: string,
  contractId: string,
): Promise<ContractForClient | null> {
  const { data, error } = await client
    .from('contracts')
    .select(CLIENT_CONTRACT_SELECT)
    .eq('tenant_id', tenantId)
    .eq('id', contractId)
    .eq('contract_parties.portal_user_id', portalUserId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null

  const { contract_parties, ...contract } = data as typeof data & { contract_parties: PartyRef[] }
  const roles = rolesOf(contract_parties, portalUserId)
  if (!roles.length) return null
  return toContractForClientModel(contract, roles)
}
