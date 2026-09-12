import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~~/shared/types/database.types'
import type {
  Contract,
  ContractForClient,
  ContractInput,
  ContractInternal,
  ContractInternalInput,
  ContractParty,
  ContractPartyInput,
  ContractPartyRole,
} from '~~/shared/models/portal'
import { CONTRACT_PARTY_ROLES } from '~~/shared/models/portal'
import {
  toContractForClient,
  toContractInternalModel,
  toContractInternalRow,
  toContractModel,
  toContractPartyModel,
  toContractRow,
} from '~~/server/mappers/contract.mapper'
import type { ContractPartyRowWithUser } from '~~/server/mappers/contract.mapper'

type Client = SupabaseClient<Database>

/*
 * Duas famílias de função convivem neste arquivo, e a diferença não é estilo:
 *
 *   listContracts / getContract / create / update  →  PAINEL, escopo por tenant
 *   listContractsForClient                         →  PORTAL, escopo por pessoa
 *
 * A do portal nunca recebe `tenantId` de quem chamou como autorização: ela parte
 * do `portalUserId`, que só existe depois de `requirePortalUser`. Se algum dia
 * uma função de painel for reaproveitada num endpoint de portal, o escopo errado
 * fica visível na assinatura.
 */

// ---------------------------------------------------------------------------
// Painel
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

export async function getContract(client: Client, tenantId: string, id: string): Promise<Contract | null> {
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
  assertCodigoDeContratoLivre(error, input.code)
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
    .maybeSingle()
  assertCodigoDeContratoLivre(error, input.code)
  if (error) throw error
  if (!data) throw createError({ statusCode: 404, statusMessage: 'Contrato não encontrado.' })
  return toContractModel(data)
}

/**
 * Código duplicado dá mensagem legível, não erro de servidor.
 *
 * Mesmo tratamento que `properties` ganhou no commit 8839a9e: a pessoa digitou
 * um código que já existe, e "erro interno" faz ela tentar de novo igual.
 */
function assertCodigoDeContratoLivre(error: { code?: string } | null, code: string) {
  if (error?.code === '23505') {
    throw createError({
      statusCode: 409,
      statusMessage: `Já existe um contrato com o código ${code.trim()}.`,
    })
  }
}

// ---------------------------------------------------------------------------
// Campos internos — tabela separada, escrita só pelo painel
// ---------------------------------------------------------------------------

/**
 * Operação SEPARADA de propósito.
 *
 * `notes`, `admin_fee_percent` e `external_id` vivem em `contract_internal`
 * justamente para que nenhum endpoint de portal os alcance por descuido. Manter
 * a leitura como função própria preserva isso na camada de código: um handler de
 * portal que chamasse isto estaria pedindo explicitamente pelo que não é dele.
 */
export async function getContractInternal(
  client: Client,
  tenantId: string,
  contractId: string,
): Promise<ContractInternal | null> {
  // O filtro por tenant vem do contrato: `contract_internal` não tem tenant_id,
  // a FK para `contracts` é o vínculo. Confirmar o contrato primeiro evita ler
  // interno de contrato de outra imobiliária por id direto.
  const contract = await getContract(client, tenantId, contractId)
  if (!contract) return null

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
  tenantId: string,
  contractId: string,
  input: ContractInternalInput,
): Promise<void> {
  const contract = await getContract(client, tenantId, contractId)
  if (!contract) throw createError({ statusCode: 404, statusMessage: 'Contrato não encontrado.' })

  const { error } = await client
    .from('contract_internal')
    .upsert(toContractInternalRow(input, contractId), { onConflict: 'contract_id' })
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Portal
// ---------------------------------------------------------------------------

/**
 * Contratos em que ESTA pessoa é parte, com o papel dela em cada um.
 *
 * Parte de `contract_parties`, não de `contracts`: é o vínculo que autoriza, e
 * é dele que sai o papel. Uma pessoa pode aparecer duas vezes no mesmo contrato
 * (inquilina e fiadora, por exemplo), então os papéis são agregados por
 * contrato em vez de multiplicarem a linha.
 */
export async function listContractsForClient(
  client: Client,
  portalUserId: string,
): Promise<ContractForClient[]> {
  const { data, error } = await client
    .from('contract_parties')
    .select('role, contracts(*)')
    .eq('portal_user_id', portalUserId)
  if (error) throw error

  const porContrato = new Map<string, { row: Database['public']['Tables']['contracts']['Row']; roles: ContractPartyRole[] }>()
  for (const linha of data ?? []) {
    // O embed vem nulo quando a RLS do contrato recusa — e recusa é o
    // comportamento certo quando o entitlement do tenant está desligado.
    const row = linha.contracts
    if (!row) continue
    const atual = porContrato.get(row.id)
    if (atual) atual.roles.push(linha.role)
    else porContrato.set(row.id, { row, roles: [linha.role] })
  }

  return [...porContrato.values()]
    .map(({ row, roles }) => toContractForClient(row, roles))
    .sort((a, b) => (a.startedOn ?? '').localeCompare(b.startedOn ?? '') * -1)
}

/**
 * UM contrato, se esta pessoa for parte dele.
 *
 * Parte de `contract_parties` pelo mesmo motivo da listagem: é o vínculo que
 * autoriza. Note que NÃO existe um `getContract(client, tenantId, id)` sendo
 * reaproveitado aqui com um check depois — a consulta já nasce escopada na
 * pessoa, então "não é parte" e "não existe" produzem o mesmo `null`, e o
 * handler não tem como vazar a diferença por descuido.
 *
 * Essa indistinção é deliberada: responder 403 para contrato alheio e 404 para
 * inexistente conta ao curioso quais ids existem.
 */
export async function getContractForClient(
  client: Client,
  portalUserId: string,
  contractId: string,
): Promise<ContractForClient | null> {
  const { data, error } = await client
    .from('contract_parties')
    .select('role, contracts(*)')
    .eq('portal_user_id', portalUserId)
    .eq('contract_id', contractId)
  if (error) throw error

  const linhas = data ?? []
  if (linhas.length === 0) return null

  // O embed vem nulo quando a RLS do contrato recusa (entitlement desligado,
  // por exemplo). Vínculo sem contrato legível é o mesmo que nada.
  const row = linhas[0]!.contracts
  if (!row) return null

  // Mesma pessoa pode ter dois papéis no mesmo contrato (inquilina e fiadora).
  return toContractForClient(row, linhas.map((l) => l.role))
}

/** Os papéis desta pessoa num contrato específico. Vazio = não é parte. */
export async function rolesInContract(
  client: Client,
  portalUserId: string,
  contractId: string,
): Promise<ContractPartyRole[]> {
  const { data, error } = await client
    .from('contract_parties')
    .select('role')
    .eq('portal_user_id', portalUserId)
    .eq('contract_id', contractId)
  if (error) throw error
  return (data ?? []).map((r) => r.role)
}

// ---------------------------------------------------------------------------
// Partes — quem está no contrato, e em que papel
// ---------------------------------------------------------------------------

/*
 * As três funções abaixo confirmam o contrato pelo tenant ANTES de tocar em
 * `contract_parties`. A tabela não tem `tenant_id` — o vínculo com a imobiliária
 * passa pela FK para `contracts`, exatamente como em `contract_internal`. Sem a
 * conferência, um id de contrato descoberto permitiria listar (ou alterar) os
 * participantes de outra imobiliária.
 */

const SELECT_PARTY = 'id, contract_id, portal_user_id, role, portal_users(name, email, active)'

export async function listContractParties(
  client: Client,
  tenantId: string,
  contractId: string,
): Promise<ContractParty[]> {
  const contract = await getContract(client, tenantId, contractId)
  if (!contract) return []

  const { data, error } = await client
    .from('contract_parties')
    .select(SELECT_PARTY)
    .eq('contract_id', contractId)
  if (error) throw error

  return (data ?? [])
    .map((row) => toContractPartyModel(row as unknown as ContractPartyRowWithUser))
    .filter((p): p is ContractParty => p !== null)
    // Inquilino primeiro, depois proprietário, depois fiador: é a ordem em que
    // a imobiliária fala do contrato, não a ordem de cadastro.
    .sort((a, b) => CONTRACT_PARTY_ROLES.indexOf(a.role) - CONTRACT_PARTY_ROLES.indexOf(b.role))
}

export async function addContractParty(
  client: Client,
  tenantId: string,
  contractId: string,
  input: ContractPartyInput,
): Promise<ContractParty> {
  const contract = await getContract(client, tenantId, contractId)
  if (!contract) throw createError({ statusCode: 404, statusMessage: 'Contrato não encontrado.' })

  // A pessoa precisa ser desta imobiliária. A RLS de `portal_users` já recusaria
  // a leitura de um cliente de outro tenant, mas o insert em `contract_parties`
  // olha só para o contrato — sem esta conferência, um `portalUserId` de fora
  // entraria na tabela e viraria acesso concedido.
  const { data: pessoa, error: erroPessoa } = await client
    .from('portal_users')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('id', input.portalUserId)
    .maybeSingle()
  if (erroPessoa) throw erroPessoa
  if (!pessoa) throw createError({ statusCode: 404, statusMessage: 'Cliente não encontrado.' })

  const { data, error } = await client
    .from('contract_parties')
    .insert({ contract_id: contractId, portal_user_id: input.portalUserId, role: input.role })
    .select(SELECT_PARTY)
    .single()

  // O unique é (contract_id, portal_user_id, role). Repetir o mesmo papel para a
  // mesma pessoa não é erro de servidor — é a imobiliária clicando duas vezes.
  if (error?.code === '23505') {
    throw createError({
      statusCode: 409,
      statusMessage: 'Esta pessoa já está no contrato com esse papel.',
    })
  }
  if (error) throw error

  const party = toContractPartyModel(data as unknown as ContractPartyRowWithUser)
  if (!party) throw createError({ statusCode: 500, statusMessage: 'Não foi possível ler o vínculo criado.' })
  return party
}

/**
 * Desvincula alguém do contrato.
 *
 * Apaga a LINHA DE VÍNCULO, nunca o cliente: a pessoa continua cadastrada, com
 * os outros contratos dela e com a trilha de download intacta. Tirar o fiador
 * de um contrato não é motivo para ele sumir do sistema.
 */
export async function removeContractParty(
  client: Client,
  tenantId: string,
  contractId: string,
  partyId: string,
): Promise<void> {
  const contract = await getContract(client, tenantId, contractId)
  if (!contract) throw createError({ statusCode: 404, statusMessage: 'Contrato não encontrado.' })

  const { error } = await client
    .from('contract_parties')
    .delete()
    .eq('contract_id', contractId)
    .eq('id', partyId)
  if (error) throw error
}
