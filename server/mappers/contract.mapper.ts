import type { Database } from '~~/shared/types/database.types'
import type {
  Contract,
  ContractForClient,
  ContractInput,
  ContractInternal,
  ContractInternalInput,
  ContractPartyRole,
} from '~~/shared/models/portal'

type ContractRow = Database['public']['Tables']['contracts']['Row']
type ContractInsert = Database['public']['Tables']['contracts']['Insert']
type InternalRow = Database['public']['Tables']['contract_internal']['Row']
type InternalInsert = Database['public']['Tables']['contract_internal']['Insert']

/** Visão do PAINEL. Não carrega os campos internos — eles vivem em outra tabela. */
export function toContractModel(row: ContractRow): Contract {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    code: row.code,
    propertyId: row.property_id,
    addressLabel: row.address_label,
    status: row.status,
    startedOn: row.started_on,
    endsOn: row.ends_on,
    rentAmount: row.rent_amount,
    dueDay: row.due_day,
    adjustmentIndex: row.adjustment_index,
    // `source` é text com CHECK no banco; o domínio é o par manual|erp.
    source: row.source === 'erp' ? 'erp' : 'manual',
    createdAt: row.created_at,
  }
}

/**
 * Visão do CLIENTE.
 *
 * Função separada, e não um `toContractModel` com campos apagados depois: o tipo
 * `ContractForClient` simplesmente não tem `tenantId`, `propertyId` nem
 * `source`. Nada disso diz algo a um inquilino, e o que não existe no tipo não
 * vaza por descuido num endpoint novo.
 *
 * Os papéis vêm de fora porque saem de `contract_parties`, não da linha do
 * contrato: a MESMA pessoa pode ser inquilina de um contrato e proprietária de
 * outro.
 */
export function toContractForClient(row: ContractRow, roles: ContractPartyRole[]): ContractForClient {
  return {
    id: row.id,
    code: row.code,
    addressLabel: row.address_label,
    status: row.status,
    startedOn: row.started_on,
    endsOn: row.ends_on,
    rentAmount: row.rent_amount,
    dueDay: row.due_day,
    roles,
  }
}

export function toContractRow(input: ContractInput, tenantId: string): ContractInsert {
  return {
    tenant_id: tenantId,
    code: input.code.trim(),
    property_id: input.propertyId || null,
    address_label: input.addressLabel?.trim() || null,
    status: input.status ?? 'ativo',
    started_on: input.startedOn || null,
    ends_on: input.endsOn || null,
    rent_amount: input.rentAmount ?? null,
    due_day: input.dueDay ?? null,
    adjustment_index: input.adjustmentIndex?.trim() || null,
  }
}

export function toContractInternalModel(row: InternalRow): ContractInternal {
  return {
    contractId: row.contract_id,
    notes: row.notes,
    adminFeePercent: row.admin_fee_percent,
    externalId: row.external_id,
  }
}

export function toContractInternalRow(input: ContractInternalInput, contractId: string): InternalInsert {
  return {
    contract_id: contractId,
    notes: input.notes?.trim() || null,
    admin_fee_percent: input.adminFeePercent ?? null,
    external_id: input.externalId?.trim() || null,
  }
}
