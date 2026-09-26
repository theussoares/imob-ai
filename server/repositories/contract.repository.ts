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
import { contratoQueOcupa } from '~~/shared/models/lease'
import {
  toContractForClientModel,
  toContractInternalModel,
  toContractInternalRow,
  toContractModel,
  toContractRow,
} from '~~/server/mappers/contract.mapper'

type Client = SupabaseClient<Database>

/**
 * Traduz o código repetido antes que ele vire 500.
 *
 * Mesmo desenho de `assertCodigoLivre` em `property.repository.ts`, e pelo
 * mesmo motivo registrado lá: o 23505 sobe sem `statusMessage`, a tela cai no
 * texto genérico "verifique os campos", e a pessoa confere campo por campo um
 * cadastro que está inteiro certo menos o código.
 *
 * `contracts` tem uma única constraint UNIQUE além da chave primária (uuid
 * gerado, que não colide), então 23505 aqui é sempre `(tenant_id, code)`.
 */
function assertCodigoContratoLivre(error: unknown, code: string): void {
  if ((error as { code?: string } | null)?.code !== '23505') return
  throw createError({
    statusCode: 409,
    statusMessage: `Já existe um contrato com o código ${code.trim()} nesta imobiliária. Use outro código, ou edite o contrato que já está cadastrado com ele.`,
  })
}

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
  assertCodigoContratoLivre(error, input.code)
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
    // `maybeSingle`: contrato de OUTRA imobiliária é falha de propriedade e
    // merece 404 limpo. Com `single` o update acertava zero linhas, o PostgREST
    // devolvia PGRST116 e o handler respondia 500 — barulho no log e nenhuma
    // resposta útil para quem chamou.
    .maybeSingle()
  assertCodigoContratoLivre(error, input.code)
  if (error) throw error
  if (!data) throw createError({ statusCode: 404, statusMessage: 'Contrato não encontrado.' })
  return toContractModel(data)
}

/**
 * Recusa um segundo contrato ativo no mesmo imóvel e no mesmo período.
 *
 * Checagem na aplicação e não constraint de exclusão no banco (`btree_gist` +
 * `daterange`): produção já tem pares sobrepostos criados antes desta guarda
 * (LOC-2026-001 e 003), e a constraint não nasceria enquanto a imobiliária não
 * decidir qual dos dois vale. O custo é a corrida entre duas abas criando ao
 * mesmo tempo, que é rara num painel de poucos usuários.
 *
 * Lê só os contratos daquele imóvel; a regra de sobreposição mora em
 * `contratoQueOcupa`, que a tela do assistente também usa para avisar antes.
 */
export async function assertImovelLivreNoPeriodo(
  client: Client,
  tenantId: string,
  alvo: { propertyId?: string | null; startedOn?: string | null; endsOn?: string | null; excetoId?: string },
): Promise<void> {
  if (!alvo.propertyId) return
  const { data, error } = await client
    .from('contracts')
    .select('id, code, property_id, status, started_on, ends_on')
    .eq('tenant_id', tenantId)
    .eq('property_id', alvo.propertyId)
    .eq('status', 'ativo')
  if (error) throw error
  const ocupante = contratoQueOcupa(
    (data ?? []).map((r) => ({
      id: r.id,
      code: r.code,
      propertyId: r.property_id,
      status: r.status,
      startedOn: r.started_on,
      endsOn: r.ends_on,
    })),
    alvo,
  )
  if (ocupante) {
    throw createError({
      statusCode: 409,
      statusMessage: `Este imóvel já está alugado no contrato ${ocupante.code}, que está ativo nesse período. Encerre aquele contrato ou ajuste as datas antes de criar outro.`,
    })
  }
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


// ---------------------------------------------------------------------------
// Partes do contrato
// ---------------------------------------------------------------------------

export interface ParteDoContrato {
  id: string
  portalUserId: string
  role: ContractPartyRole
  /** Nome do cliente, para a tela do painel não precisar de uma segunda busca. */
  nome: string
  email: string | null
  ativo: boolean
  /** CPF/CNPJ — a ficha mostra a pendência "inquilino sem documento". */
  doc: string | null
  telefone: string | null
  /** Tem conta no portal (0050: cliente pode existir sem acesso). */
  temAcesso: boolean
}

/**
 * Quem está neste contrato, e em que papel.
 *
 * Só para o PAINEL: traz nome e e-mail das partes, que são exatamente o que as
 * policies escondem de um cliente do outro. Nenhum endpoint do portal chama
 * isto — ver `portal-payload-guardrail`.
 */
export async function listContractParties(
  client: Client,
  tenantId: string,
  contractId: string,
): Promise<ParteDoContrato[]> {
  const { data, error } = await client
    .from('contract_parties')
    // O embed é filtrado por tenant com `!inner`: `contract_parties` não tem
    // coluna de tenant própria, então sem isto um id de contrato de outra
    // imobiliária devolveria as partes dela.
    .select('id, role, portal_user_id, portal_users!inner(name, email, active, doc, phone, user_id, tenant_id)')
    .eq('contract_id', contractId)
    .eq('portal_users.tenant_id', tenantId)
  if (error) throw error

  return (data ?? []).map((row) => {
    const pu = (row as unknown as {
      portal_users: { name: string; email: string | null; active: boolean; doc: string | null; phone: string | null; user_id: string | null }
    }).portal_users
    return {
      id: row.id,
      portalUserId: row.portal_user_id,
      role: row.role,
      nome: pu.name,
      email: pu.email,
      ativo: pu.active,
      doc: pu.doc,
      telefone: pu.phone,
      temAcesso: !!pu.user_id,
    }
  })
}

/**
 * Vincula uma pessoa ao contrato com um papel.
 *
 * Confere que contrato e cliente são do MESMO tenant antes de gravar.
 * `contract_parties` não tem `tenant_id`, então a tabela sozinha aceitaria
 * ligar o contrato de uma imobiliária ao cliente de outra — e a partir daí
 * aquela pessoa passaria a enxergar documentos que não são dela.
 */
export async function addContractParty(
  client: Client,
  tenantId: string,
  contractId: string,
  portalUserId: string,
  role: ContractPartyRole,
): Promise<void> {
  const [{ data: contrato }, { data: cliente }] = await Promise.all([
    client.from('contracts').select('id').eq('tenant_id', tenantId).eq('id', contractId).maybeSingle(),
    client.from('portal_users').select('id').eq('tenant_id', tenantId).eq('id', portalUserId).maybeSingle(),
  ])
  if (!contrato || !cliente) {
    throw createError({ statusCode: 404, statusMessage: 'Contrato ou cliente não encontrado.' })
  }

  const { error } = await client
    .from('contract_parties')
    .insert({ contract_id: contractId, portal_user_id: portalUserId, role })

  // A mesma pessoa no mesmo papel do mesmo contrato é o índice único da 0028.
  // Não é erro do usuário: é clique repetido, e a resposta certa é silêncio.
  if ((error as { code?: string } | null)?.code === '23505') return
  if (error) throw error
}

/** Desfaz um vínculo. O contrato e o cliente continuam existindo. */
export async function removeContractParty(
  client: Client,
  tenantId: string,
  contractId: string,
  partyId: string,
): Promise<void> {
  const { data: contrato } = await client
    .from('contracts')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('id', contractId)
    .maybeSingle()
  if (!contrato) throw createError({ statusCode: 404, statusMessage: 'Contrato não encontrado.' })

  const { error } = await client
    .from('contract_parties')
    .delete()
    .eq('id', partyId)
    .eq('contract_id', contractId)
  if (error) throw error
}

/**
 * Próximo código livre no formato LOC-AAAA-NNN. Sugestão, não sequência
 * garantida: dois contratos criados no mesmo instante podem calcular o mesmo
 * número, e o índice único (tenant_id, code) recusa o segundo — quem chama
 * tenta de novo com o seguinte (ver `criarLocacao`).
 */
export async function nextContractCode(client: Client, tenantId: string, ano: number): Promise<string> {
  const prefixo = `LOC-${ano}-`
  const { data, error } = await client
    .from('contracts')
    .select('code')
    .eq('tenant_id', tenantId)
    .ilike('code', `${prefixo}%`)
  if (error) throw error
  const maior = (data ?? []).reduce((m, r) => {
    const n = Number(r.code.slice(prefixo.length))
    return Number.isInteger(n) && n > m ? n : m
  }, 0)
  return `${prefixo}${String(maior + 1).padStart(3, '0')}`
}
