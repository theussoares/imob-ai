import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~~/shared/types/database.types'
import type { ContractPartyRole, PortalUser, PortalUserInput } from '~~/shared/models/portal'
import { toPortalUserModel, toPortalUserRow } from '~~/server/mappers/portal-user.mapper'
import { formatarDocumento } from '~~/shared/utils/cpf-cnpj'
import { onlyDigits } from '~~/shared/utils/phone'

type Client = SupabaseClient<Database>

export async function listPortalUsers(client: Client, tenantId: string): Promise<PortalUser[]> {
  const { data, error } = await client
    .from('portal_users')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('name', { ascending: true })
  if (error) throw error
  return (data ?? []).map(toPortalUserModel)
}

export async function getPortalUser(
  client: Client,
  tenantId: string,
  id: string,
): Promise<PortalUser | null> {
  const { data, error } = await client
    .from('portal_users')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data ? toPortalUserModel(data) : null
}

export async function createPortalUser(
  client: Client,
  tenantId: string,
  userId: string,
  input: PortalUserInput,
): Promise<PortalUser> {
  const { data, error } = await client
    .from('portal_users')
    .insert(toPortalUserRow(input, tenantId, userId))
    .select('*')
    .single()
  if (error) throw error
  return toPortalUserModel(data)
}

/**
 * Liga e desliga o acesso sem apagar histórico.
 *
 * Com `active = false` a pessoa para de passar nas policies do portal, mas a
 * trilha de quem baixou o quê continua de pé — que é justamente o que não pode
 * sumir quando um contrato encerra.
 *
 * (A checagem de `active` é feita INLINE por cada policy, não por
 * `is_portal_user()`: essa função existe desde a 0028 e nenhuma policy a chama.
 * Ver a nota no topo da 0036.)
 */
export async function setPortalUserActive(
  client: Client,
  tenantId: string,
  id: string,
  active: boolean,
): Promise<PortalUser> {
  const { data, error } = await client
    .from('portal_users')
    .update({ active })
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .select('*')
    // `maybeSingle`: com `single`, um id que não é deste tenant (ou que acabou
    // de ser apagado noutra aba) sairia como 500 em vez de 404.
    .maybeSingle()
  if (error) throw error
  if (!data) throw createError({ statusCode: 404, statusMessage: 'Cliente não encontrado.' })
  return toPortalUserModel(data)
}

/**
 * Recusa um CPF/CNPJ que já está em outro cliente desta imobiliária.
 *
 * O e-mail sempre teve índice único; o documento não, e deu para cadastrar a
 * mesma pessoa duas vezes. Duplicado aqui não é só lista feia: o contrato fica
 * num cadastro e o acesso ao portal no outro, e o boleto (que é pelo CPF no
 * provedor) junta os dois como um cliente só.
 *
 * Na aplicação, e não índice único no banco, porque `doc` é gravado como
 * digitado (com ou sem pontuação) — o índice teria de ser sobre uma expressão
 * de dígitos — e porque produção já tem o par duplicado que motivou isto: o
 * índice não nasceria até alguém juntar os dois cadastros.
 */
export async function assertDocumentoLivre(
  client: Client,
  tenantId: string,
  doc: string | null | undefined,
  excetoId?: string,
): Promise<void> {
  const digitos = onlyDigits(doc)
  if (!digitos) return
  const { data, error } = await client
    .from('portal_users')
    .select('id, name, doc')
    .eq('tenant_id', tenantId)
    .not('doc', 'is', null)
  if (error) throw error
  const outro = (data ?? []).find((c) => c.id !== excetoId && onlyDigits(c.doc) === digitos)
  if (outro) {
    throw createError({
      statusCode: 409,
      statusMessage: `O CPF/CNPJ ${formatarDocumento(digitos)} já está no cadastro de ${outro.name}. Use esse cadastro em vez de criar outro.`,
    })
  }
}

/**
 * Cadastro SEM acesso ao portal (0050): o fiador que nunca vai entrar, o
 * proprietário que só usa WhatsApp. `user_id` nulo — nenhuma regra de acesso
 * do portal casa com ele. Dar acesso depois é `convidarClientePortal`, que
 * liga a conta a esta mesma linha.
 */
export async function createClientRecord(
  client: Client,
  tenantId: string,
  input: PortalUserInput,
): Promise<PortalUser> {
  await assertDocumentoLivre(client, tenantId, input.doc)
  const { data, error } = await client
    .from('portal_users')
    .insert(toPortalUserRow(input, tenantId, null))
    .select('*')
    .single()
  if ((error as { code?: string } | null)?.code === '23505') {
    throw createError({ statusCode: 409, statusMessage: `${input.email} já está cadastrado nesta imobiliária.` })
  }
  if (error) throw error
  return toPortalUserModel(data)
}

/**
 * Corrige nome, telefone, documento e — só para quem ainda NÃO tem acesso —
 * o e-mail. Com conta ligada, o e-mail é a identidade no Auth: trocá-lo aqui
 * desencontraria o cadastro da conta, e o convite seguinte iria para a pessoa
 * errada.
 */
export async function updateClientRecord(
  client: Client,
  tenantId: string,
  id: string,
  input: { name?: string; phone?: string | null; doc?: string | null; email?: string | null },
): Promise<PortalUser> {
  const atual = await getPortalUser(client, tenantId, id)
  if (!atual) throw createError({ statusCode: 404, statusMessage: 'Cliente não encontrado.' })
  const patch: Database['public']['Tables']['portal_users']['Update'] = {}
  if (input.name !== undefined) patch.name = String(input.name).trim()
  if (input.phone !== undefined) patch.phone = input.phone?.trim() || null
  if (input.doc !== undefined) {
    await assertDocumentoLivre(client, tenantId, input.doc, id)
    patch.doc = input.doc?.trim() || null
  }
  if (input.email !== undefined) {
    const email = input.email?.trim().toLowerCase() || null
    if (atual.userId && email !== atual.email) {
      throw createError({ statusCode: 409, statusMessage: 'Quem já tem acesso não troca de e-mail por aqui: é o login dele.' })
    }
    patch.email = email
  }
  const { data, error } = await client
    .from('portal_users')
    .update(patch)
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .select('*')
    .maybeSingle()
  if ((error as { code?: string } | null)?.code === '23505') {
    throw createError({ statusCode: 409, statusMessage: 'Este e-mail já está em outro cadastro desta imobiliária.' })
  }
  if (error) throw error
  if (!data) throw createError({ statusCode: 404, statusMessage: 'Cliente não encontrado.' })
  return toPortalUserModel(data)
}

export interface ContratoDoCliente {
  id: string
  code: string
  addressLabel: string | null
  status: 'ativo' | 'encerrado'
  role: ContractPartyRole
}

/**
 * Clientes com os contratos de cada um e o papel em cada contrato — "de quais
 * locações a Helena participa, e como". Uma ida ao banco, por embed.
 */
export async function listClientsWithContracts(
  client: Client,
  tenantId: string,
): Promise<(PortalUser & { contratos: ContratoDoCliente[] })[]> {
  const { data, error } = await client
    .from('portal_users')
    .select('*, contract_parties(role, contracts(id, code, address_label, status, tenant_id))')
    .eq('tenant_id', tenantId)
    .order('name', { ascending: true })
  if (error) throw error
  type Embed = { role: ContractPartyRole; contracts: { id: string; code: string; address_label: string | null; status: 'ativo' | 'encerrado'; tenant_id: string } | null }
  return (data ?? []).map((row) => {
    const { contract_parties, ...resto } = row as typeof row & { contract_parties: Embed[] | null }
    return {
      ...toPortalUserModel(resto as Parameters<typeof toPortalUserModel>[0]),
      contratos: (contract_parties ?? [])
        // Cinto: a parte aponta para contrato do MESMO tenant pela regra de
        // negócio, e conferir aqui custa uma comparação.
        .filter((p) => p.contracts && p.contracts.tenant_id === tenantId)
        .map((p) => ({ id: p.contracts!.id, code: p.contracts!.code, addressLabel: p.contracts!.address_label, status: p.contracts!.status, role: p.role })),
    }
  })
}
