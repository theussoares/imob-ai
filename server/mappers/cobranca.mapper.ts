import type {
  Charge,
  ChargeForClient,
  ChargeItemKind,
  ChargeKind,
  OwnerPayout,
  PaymentAccountView,
  PaymentEnvironment,
  PaymentProviderName,
  SettlementMethod,
} from '~~/shared/models/cobranca'
import { estadoDaCobranca, somar } from '~~/shared/models/cobranca'

/**
 * Colunas lidas da cobrança, com itens e liquidações embutidos.
 *
 * Lista explícita, nunca `*`: `external_id` e `provider_environment` são
 * detalhe interno e o recorte do inquilino (`paraCliente`) sai daqui também.
 */
export const CHARGE_SELECT =
  'id, contract_id, kind, competence, due_on, issued_amount, issued_at, provider, provider_environment, external_id, payment_url, bank_slip_url, digitable_line, pix_copy_paste, fine_percent, interest_monthly_percent, canceled_at, cancel_reason, created_at, charge_items(id, kind, description, amount), charge_settlements(id, amount, settled_on, method, created_by)'

export interface ChargeRow {
  id: string
  contract_id: string
  kind: string
  competence: string
  due_on: string
  issued_amount: number | string | null
  issued_at: string | null
  provider: string | null
  provider_environment: string | null
  external_id: string | null
  payment_url: string | null
  bank_slip_url: string | null
  digitable_line: string | null
  pix_copy_paste: string | null
  fine_percent: number | string | null
  interest_monthly_percent: number | string | null
  canceled_at: string | null
  cancel_reason: string | null
  created_at: string
  charge_items?: { id: string; kind: string; description: string | null; amount: number | string }[] | null
  charge_settlements?: { id: string; amount: number | string; settled_on: string; method: string; created_by: string | null }[] | null
}

/** `numeric` chega como string do PostgREST quando passa de 15 dígitos; normaliza. */
const num = (v: number | string | null | undefined): number | null => (v == null ? null : Number(v))

export function toCharge(r: ChargeRow, hoje?: string): Charge {
  const items = (r.charge_items ?? []).map((i) => ({
    id: i.id,
    kind: i.kind as ChargeItemKind,
    description: i.description,
    amount: Number(i.amount),
  }))
  const settlements = (r.charge_settlements ?? [])
    .map((s) => ({
      id: s.id,
      amount: Number(s.amount),
      settledOn: s.settled_on,
      method: s.method as SettlementMethod,
      createdBy: s.created_by,
    }))
    .sort((a, b) => a.settledOn.localeCompare(b.settledOn))
  const total = somar(items.map((i) => i.amount))
  const settledTotal = somar(settlements.map((s) => s.amount))
  const issuedAmount = num(r.issued_amount)
  return {
    id: r.id,
    contractId: r.contract_id,
    kind: r.kind as ChargeKind,
    competence: r.competence,
    dueOn: r.due_on,
    items,
    total,
    issuedAmount,
    issuedAt: r.issued_at,
    settlements,
    settledTotal,
    status: estadoDaCobranca(
      { canceledAt: r.canceled_at, issuedAt: r.issued_at, issuedAmount, dueOn: r.due_on, total, settledTotal },
      hoje,
    ),
    provider: r.provider as PaymentProviderName | null,
    providerEnvironment: r.provider_environment as PaymentEnvironment | null,
    externalId: r.external_id,
    paymentUrl: r.payment_url,
    bankSlipUrl: r.bank_slip_url,
    digitableLine: r.digitable_line,
    pixCopyPaste: r.pix_copy_paste,
    finePercent: num(r.fine_percent),
    interestMonthlyPercent: num(r.interest_monthly_percent),
    canceledAt: r.canceled_at,
    cancelReason: r.cancel_reason,
    createdAt: r.created_at,
  }
}

/**
 * O que o INQUILINO vê (spec B4): valor emitido, vencimento, estado e os meios
 * de pagar. Rascunho não existe para ele. Itens, liquidações, taxa e provedor
 * ficam de fora — o boleto impresso já discrimina o que precisa.
 */
export function paraCliente(c: Charge): ChargeForClient | null {
  if (c.status === 'rascunho' || c.status === 'emitindo') return null
  return {
    id: c.id,
    competence: c.competence,
    dueOn: c.dueOn,
    amount: c.issuedAmount ?? c.total,
    status: c.status,
    // Link e linha só enquanto há o que pagar: boleto cancelado com linha
    // digitável à mostra é convite a pagar o que não se deve mais.
    paymentUrl: c.status === 'cancelada' || c.status === 'paga' ? null : c.paymentUrl,
    bankSlipUrl: c.status === 'cancelada' || c.status === 'paga' ? null : c.bankSlipUrl,
    digitableLine: c.status === 'cancelada' || c.status === 'paga' ? null : c.digitableLine,
    pixCopyPaste: c.status === 'cancelada' || c.status === 'paga' ? null : c.pixCopyPaste,
  }
}

export const PAYOUT_SELECT =
  'id, contract_id, competence, scheduled_for, paid_at, canceled_at, payout_items(kind, amount, source_charge_id)'

export interface PayoutRow {
  id: string
  contract_id: string
  competence: string
  scheduled_for: string | null
  paid_at: string | null
  canceled_at: string | null
  payout_items?: { kind: string; amount: number | string; source_charge_id: string | null }[] | null
}

export function toPayout(r: PayoutRow): OwnerPayout {
  const itens = r.payout_items ?? []
  const gross = somar(itens.filter((i) => i.kind === 'bruto').map((i) => Number(i.amount)))
  const adminFee = -somar(itens.filter((i) => i.kind === 'taxa_adm').map((i) => Number(i.amount)))
  return {
    id: r.id,
    contractId: r.contract_id,
    competence: r.competence,
    scheduledFor: r.scheduled_for,
    paidAt: r.paid_at,
    canceledAt: r.canceled_at,
    status: r.canceled_at ? 'cancelado' : r.paid_at ? 'pago' : 'pendente',
    gross,
    adminFee,
    net: somar(itens.map((i) => Number(i.amount))),
    sourceChargeId: itens.find((i) => i.source_charge_id)?.source_charge_id ?? null,
  }
}

export interface PaymentAccountRow {
  tenant_id: string
  provider: string
  environment: string
  api_key_ciphertext: string | null
  api_key_last4: string | null
  account_name: string | null
  webhook_id: string
  webhook_secret_hash: string | null
  external_webhook_id: string | null
  connected_at: string
}

/** Sem a chave, sem o hash, sem o id do webhook: o navegador não precisa de nenhum. */
export function toPaymentAccountView(r: PaymentAccountRow): PaymentAccountView {
  return {
    provider: r.provider as PaymentProviderName,
    environment: r.environment as PaymentEnvironment,
    apiKeyLast4: r.api_key_last4,
    accountName: r.account_name,
    connectedAt: r.connected_at,
  }
}
