import type { Database } from '~~/shared/types/database.types'
import type {
  Contract,
  ContractForClient,
  ContractInput,
  ContractInternal,
  ContractInternalInput,
  ContractPartyRole,
} from '~~/shared/models/portal'
import type { FireInsurancePayer, GuaranteeType } from '~~/shared/models/lease'

type ContractRow = Database['public']['Tables']['contracts']['Row']
type ContractInsert = Database['public']['Tables']['contracts']['Insert']
type ContractInternalRow = Database['public']['Tables']['contract_internal']['Row']
type ContractInternalInsert = Database['public']['Tables']['contract_internal']['Insert']

/** Contrato como o PAINEL o enxerga. */
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
    termMonths: row.term_months,
    // CHECK no banco (0050) garante a lista; o cast só troca string por união.
    guaranteeType: (row.guarantee_type as GuaranteeType | null) ?? null,
    source: row.source === 'erp' ? 'erp' : 'manual',
    createdAt: row.created_at,
  }
}

/**
 * O mesmo contrato como o CLIENTE o enxerga.
 *
 * Não é `toContractModel` com campos a menos: é a fronteira entre o que a
 * imobiliária vê e o que o cliente dela vê, e por isso monta o objeto do zero.
 * Copiar a row inteira e depois apagar chaves é como um campo interno novo
 * chega ao portal sem ninguém decidir que deveria — o `delete` de hoje não sabe
 * da coluna de amanhã.
 *
 * Fora daqui ficam `tenantId`, `propertyId`, `source` e `adjustmentIndex`:
 * detalhe de implementação ou vocabulário interno, que não diz nada a um
 * inquilino. `contract_internal` sequer é lido por este caminho.
 */
export function toContractForClientModel(
  row: ContractRow,
  roles: readonly ContractPartyRole[],
): ContractForClient {
  return {
    id: row.id,
    code: row.code,
    addressLabel: row.address_label,
    status: row.status,
    startedOn: row.started_on,
    endsOn: row.ends_on,
    rentAmount: row.rent_amount,
    dueDay: row.due_day,
    roles: [...roles],
  }
}

export function toContractInternalModel(row: ContractInternalRow): ContractInternal {
  return {
    contractId: row.contract_id,
    notes: row.notes,
    adminFeePercent: row.admin_fee_percent,
    externalId: row.external_id,
    guaranteeAmount: row.guarantee_amount,
    guaranteeDetails: row.guarantee_details,
    fireInsurancePayer: (row.fire_insurance_payer as FireInsurancePayer | null) ?? null,
    finePercent: row.fine_percent,
    interestMonthlyPercent: row.interest_monthly_percent,
    rentFeePercent: row.rent_fee_percent,
    payoutBusinessDays: row.payout_business_days,
  }
}

/**
 * Só as chaves que vieram. `toContractRow` e `toContractInternalRow` servem
 * também à EDIÇÃO, que é um upsert/replace: um formulário que ainda não
 * conhece um campo (ou um PUT parcial) não pode zerar o que outra tela gravou.
 */
function seVeio<K extends string, V>(chave: K, valor: V | undefined): Partial<Record<K, V>> {
  return valor === undefined ? {} : ({ [chave]: valor } as Record<K, V>)
}

export function toContractRow(input: ContractInput, tenantId: string): ContractInsert {
  return {
    tenant_id: tenantId,
    code: input.code.trim(),
    property_id: input.propertyId ?? null,
    address_label: input.addressLabel?.trim() || null,
    status: input.status ?? 'ativo',
    started_on: input.startedOn ?? null,
    ends_on: input.endsOn ?? null,
    rent_amount: input.rentAmount ?? null,
    due_day: input.dueDay ?? null,
    adjustment_index: input.adjustmentIndex?.trim() || null,
    ...seVeio('term_months', input.termMonths),
    ...seVeio('guarantee_type', input.guaranteeType),
  }
}

export function toContractInternalRow(
  input: ContractInternalInput,
  contractId: string,
): ContractInternalInsert {
  return {
    contract_id: contractId,
    notes: input.notes?.trim() || null,
    admin_fee_percent: input.adminFeePercent ?? null,
    external_id: input.externalId?.trim() || null,
    ...seVeio('guarantee_amount', input.guaranteeAmount),
    ...seVeio('guarantee_details', input.guaranteeDetails === undefined ? undefined : input.guaranteeDetails?.trim() || null),
    ...seVeio('fire_insurance_payer', input.fireInsurancePayer),
    ...seVeio('fine_percent', input.finePercent),
    ...seVeio('interest_monthly_percent', input.interestMonthlyPercent),
    ...seVeio('rent_fee_percent', input.rentFeePercent),
    ...seVeio('payout_business_days', input.payoutBusinessDays),
  }
}
