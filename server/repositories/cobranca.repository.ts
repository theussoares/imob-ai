import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~~/shared/types/database.types'
import type {
  Charge,
  ChargeForClient,
  ChargeItemKind,
  ChargeKind,
  OwnerPayout,
  PaymentEnvironment,
  PaymentProviderName,
  SettlementMethod,
} from '~~/shared/models/cobranca'
import type { EventoDePagamento, CobrancaEmitida } from '~~/server/services/payments/provider'
import {
  CHARGE_SELECT,
  PAYOUT_SELECT,
  paraCliente,
  toCharge,
  toPayout,
  type ChargeRow,
  type PayoutRow,
  type PaymentAccountRow,
} from '~~/server/mappers/cobranca.mapper'

type Client = SupabaseClient<Database>

/**
 * Cobrança, liquidação, repasse e conta do provedor.
 *
 * ⚠️ QUEM ESCREVE: a 0042 revogou insert/update/delete destas tabelas do papel
 * `authenticated` (o append-only virou privilégio, não convenção). Toda função
 * de escrita daqui recebe a SERVICE_ROLE — e, sem RLS, o `tenant_id` no filtro
 * de cada query é a única coisa entre uma imobiliária e o dinheiro da outra.
 * Os testes afirmam esse filtro em cada escrita.
 *
 * Leituras aceitam qualquer client; o painel lê com o do membro (RLS ligada).
 */

function erro(e: unknown): never {
  throw e
}

// ---------------------------------------------------------------------------
// Conta do provedor (SÓ service_role — nem o membro lê, 0051)
// ---------------------------------------------------------------------------

const ACCOUNT_SELECT =
  'tenant_id, provider, environment, api_key_ciphertext, api_key_last4, account_name, webhook_id, webhook_secret_hash, external_webhook_id, connected_at'

export async function getPaymentAccount(service: Client, tenantId: string): Promise<PaymentAccountRow | null> {
  const { data, error } = await service.from('tenant_payment_accounts').select(ACCOUNT_SELECT).eq('tenant_id', tenantId).maybeSingle()
  if (error) erro(error)
  return (data as PaymentAccountRow | null) ?? null
}

/** Pelo id PÚBLICO da URL do webhook — é assim que o webhook descobre o tenant. */
export async function getPaymentAccountByWebhookId(service: Client, webhookId: string): Promise<PaymentAccountRow | null> {
  const { data, error } = await service.from('tenant_payment_accounts').select(ACCOUNT_SELECT).eq('webhook_id', webhookId).maybeSingle()
  if (error) erro(error)
  return (data as PaymentAccountRow | null) ?? null
}

export interface ContaParaGravar {
  provider: PaymentProviderName
  environment: PaymentEnvironment
  apiKeyCiphertext: string | null
  apiKeyLast4: string | null
  accountName: string | null
  webhookId: string
  webhookSecretHash: string | null
  externalWebhookId: string | null
  connectedBy: string
}

export async function savePaymentAccount(service: Client, tenantId: string, c: ContaParaGravar): Promise<PaymentAccountRow> {
  const agora = new Date().toISOString()
  const { data, error } = await service
    .from('tenant_payment_accounts')
    .upsert(
      {
        tenant_id: tenantId,
        provider: c.provider,
        environment: c.environment,
        api_key_ciphertext: c.apiKeyCiphertext,
        api_key_last4: c.apiKeyLast4,
        account_name: c.accountName,
        webhook_id: c.webhookId,
        webhook_secret_hash: c.webhookSecretHash,
        external_webhook_id: c.externalWebhookId,
        connected_by: c.connectedBy,
        connected_at: agora,
        updated_at: agora,
      },
      { onConflict: 'tenant_id' },
    )
    .select(ACCOUNT_SELECT)
    .single()
  if (error) erro(error)
  return data as PaymentAccountRow
}

export async function deletePaymentAccount(service: Client, tenantId: string): Promise<void> {
  const { error } = await service.from('tenant_payment_accounts').delete().eq('tenant_id', tenantId)
  if (error) erro(error)
}

// ---------------------------------------------------------------------------
// Cliente no provedor
// ---------------------------------------------------------------------------

export async function getPaymentCustomer(
  service: Client,
  tenantId: string,
  portalUserId: string,
  provider: PaymentProviderName,
  environment: PaymentEnvironment,
): Promise<string | null> {
  const { data, error } = await service
    .from('payment_customers')
    .select('external_id')
    .eq('tenant_id', tenantId)
    .eq('portal_user_id', portalUserId)
    .eq('provider', provider)
    .eq('environment', environment)
    .maybeSingle()
  if (error) erro(error)
  return data?.external_id ?? null
}

export async function savePaymentCustomer(
  service: Client,
  tenantId: string,
  portalUserId: string,
  provider: PaymentProviderName,
  environment: PaymentEnvironment,
  externalId: string,
): Promise<void> {
  const { error } = await service.from('payment_customers').upsert(
    { tenant_id: tenantId, portal_user_id: portalUserId, provider, environment, external_id: externalId },
    { onConflict: 'tenant_id,portal_user_id,provider,environment' },
  )
  if (error) erro(error)
}

// ---------------------------------------------------------------------------
// Cobranças
// ---------------------------------------------------------------------------

export async function listCharges(client: Client, tenantId: string, contractId: string): Promise<Charge[]> {
  const { data, error } = await client
    .from('contract_charges')
    .select(CHARGE_SELECT)
    .eq('tenant_id', tenantId)
    .eq('contract_id', contractId)
    .order('competence', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) erro(error)
  return ((data ?? []) as unknown as ChargeRow[]).map((r) => toCharge(r))
}

/**
 * Os boletos de um contrato no recorte do INQUILINO (`paraCliente`).
 *
 * Existe como função própria, e não como `listCharges` + mapa no endpoint,
 * porque é o único uso de service_role no portal que lê dinheiro: as tabelas
 * financeiras não têm policy de portal (0041), de propósito. Com o recorte
 * aqui dentro, a linha completa (itens, liquidações, id no provedor) nunca
 * chega ao código do endpoint — e o guardrail do portal libera ESTE nome, não
 * a service_role em geral. Quem chama já provou, com o client do cliente, que
 * ele é inquilino do contrato.
 */
export async function listChargesForTenantAsClient(service: Client, tenantId: string, contractId: string): Promise<ChargeForClient[]> {
  const cobrancas = await listCharges(service, tenantId, contractId)
  return cobrancas.map((c) => paraCliente(c)).filter((c): c is ChargeForClient => !!c)
}

export async function getCharge(client: Client, tenantId: string, chargeId: string): Promise<Charge | null> {
  const { data, error } = await client.from('contract_charges').select(CHARGE_SELECT).eq('tenant_id', tenantId).eq('id', chargeId).maybeSingle()
  if (error) erro(error)
  return data ? toCharge(data as unknown as ChargeRow) : null
}

export async function getChargeByExternalId(
  service: Client,
  tenantId: string,
  provider: PaymentProviderName,
  externalId: string,
): Promise<Charge | null> {
  const { data, error } = await service
    .from('contract_charges')
    .select(CHARGE_SELECT)
    .eq('tenant_id', tenantId)
    .eq('provider', provider)
    .eq('external_id', externalId)
    .maybeSingle()
  if (error) erro(error)
  return data ? toCharge(data as unknown as ChargeRow) : null
}

export interface NovaCobranca {
  kind: ChargeKind
  competence: string
  dueOn: string
  items: { kind: ChargeItemKind; description: string | null; amount: number }[]
}

/**
 * Rascunho com itens. Sem transação no PostgREST: se os itens falham, a
 * cobrança recém-criada é apagada (compensação), para não sobrar um rascunho
 * de total zero ocupando o único "mensal" daquele mês.
 */
export async function createChargeDraft(
  service: Client,
  tenantId: string,
  contractId: string,
  nova: NovaCobranca,
  userId: string,
): Promise<string> {
  const { data, error } = await service
    .from('contract_charges')
    .insert({
      tenant_id: tenantId,
      contract_id: contractId,
      kind: nova.kind,
      competence: nova.competence,
      due_on: nova.dueOn,
      created_by: userId,
    })
    .select('id')
    .single()
  if ((error as { code?: string } | null)?.code === '23505') {
    throw createError({
      statusCode: 409,
      statusMessage: 'Já existe uma cobrança mensal deste mês para o contrato. Cancele a anterior ou lance uma avulsa.',
    })
  }
  if (error || !data) erro(error)
  const id = data.id

  const { error: itensErr } = await service.from('charge_items').insert(
    nova.items.map((i) => ({
      tenant_id: tenantId,
      charge_id: id,
      kind: i.kind,
      description: i.description,
      amount: i.amount,
      created_by: userId,
    })),
  )
  if (itensErr) {
    await service.from('contract_charges').delete().eq('tenant_id', tenantId).eq('id', id).is('issued_at', null)
    erro(itensErr)
  }
  return id
}

/** Rascunho nunca emitido pode ser apagado; emitida só se cancela (o boleto existiu). */
export async function deleteChargeDraft(service: Client, tenantId: string, chargeId: string): Promise<boolean> {
  const { data, error } = await service
    .from('contract_charges')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('id', chargeId)
    .is('issued_at', null)
    .select('id')
  if (error) erro(error)
  return (data ?? []).length > 0
}

/**
 * A trava contra dois cliques em "Emitir": grava `issued_at` só se ainda está
 * nulo. Quem não conseguiu a trava recebe `false` e NÃO chama o provedor.
 */
export async function lockChargeForIssue(service: Client, tenantId: string, chargeId: string): Promise<boolean> {
  const { data, error } = await service
    .from('contract_charges')
    .update({ issued_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('id', chargeId)
    .is('issued_at', null)
    .is('canceled_at', null)
    .select('id')
  if (error) erro(error)
  return (data ?? []).length > 0
}

export async function unlockChargeIssue(service: Client, tenantId: string, chargeId: string): Promise<void> {
  const { error } = await service
    .from('contract_charges')
    .update({ issued_at: null })
    .eq('tenant_id', tenantId)
    .eq('id', chargeId)
    .is('issued_amount', null)
  if (error) erro(error)
}

export async function markChargeIssued(
  service: Client,
  tenantId: string,
  chargeId: string,
  d: {
    amount: number
    provider: PaymentProviderName
    environment: PaymentEnvironment
    finePercent: number | null
    interestMonthlyPercent: number | null
    emitida: CobrancaEmitida
  },
): Promise<void> {
  const { error } = await service
    .from('contract_charges')
    .update({
      issued_amount: d.amount,
      provider: d.provider,
      provider_environment: d.environment,
      external_id: d.emitida.externalId,
      payment_url: d.emitida.paymentUrl,
      bank_slip_url: d.emitida.bankSlipUrl,
      digitable_line: d.emitida.digitableLine,
      pix_copy_paste: d.emitida.pixCopyPaste,
      fine_percent: d.finePercent,
      interest_monthly_percent: d.interestMonthlyPercent,
    })
    .eq('tenant_id', tenantId)
    .eq('id', chargeId)
    .is('issued_amount', null)
  if (error) erro(error)
}

export async function markChargeCanceled(
  service: Client,
  tenantId: string,
  chargeId: string,
  reason: string | null,
  userId: string | null,
): Promise<void> {
  const { error } = await service
    .from('contract_charges')
    .update({ canceled_at: new Date().toISOString(), canceled_by: userId, cancel_reason: reason })
    .eq('tenant_id', tenantId)
    .eq('id', chargeId)
    .is('canceled_at', null)
  if (error) erro(error)
}

export async function addChargeItem(
  service: Client,
  tenantId: string,
  chargeId: string,
  item: { kind: ChargeItemKind; description: string | null; amount: number },
  userId: string | null,
): Promise<void> {
  const { error } = await service
    .from('charge_items')
    .insert({ tenant_id: tenantId, charge_id: chargeId, ...item, created_by: userId })
  if (error) erro(error)
}

/**
 * Liquidação. `duplicada` quando a chave de idempotência já existe (o
 * provedor reenviou) — é sucesso, não erro: responder erro faria o Asaas
 * reenviar de novo e, depois de várias falhas, PAUSAR a fila da conta.
 */
export async function insertSettlement(
  service: Client,
  tenantId: string,
  chargeId: string,
  s: { amount: number; settledOn: string; method: SettlementMethod; externalRef: string | null; idempotencyKey: string | null; createdBy: string | null },
): Promise<'ok' | 'duplicada'> {
  const { error } = await service.from('charge_settlements').insert({
    tenant_id: tenantId,
    charge_id: chargeId,
    amount: s.amount,
    settled_on: s.settledOn,
    method: s.method,
    external_ref: s.externalRef,
    idempotency_key: s.idempotencyKey,
    created_by: s.createdBy,
  })
  if ((error as { code?: string } | null)?.code === '23505') return 'duplicada'
  if (error) erro(error)
  return 'ok'
}

/** Estorno de liquidação: linha negativa apontando para a original (append-only). */
export async function reverseSettlements(
  service: Client,
  tenantId: string,
  charge: Charge,
  settledOn: string,
  idempotencyKey: string,
): Promise<number> {
  let n = 0
  for (const s of charge.settlements.filter((x) => x.amount > 0)) {
    const { error } = await service.from('charge_settlements').insert({
      tenant_id: tenantId,
      charge_id: charge.id,
      amount: -s.amount,
      settled_on: settledOn,
      method: s.method,
      reverses_settlement_id: s.id,
      idempotency_key: `${idempotencyKey}:${s.id}`,
    })
    // 23505 aqui é o índice "um estorno por origem" da 0042: já estornada.
    if ((error as { code?: string } | null)?.code === '23505') continue
    if (error) erro(error)
    n++
  }
  return n
}

// ---------------------------------------------------------------------------
// Diário do webhook
// ---------------------------------------------------------------------------

export async function registerWebhookEvent(
  service: Client,
  tenantId: string,
  provider: PaymentProviderName,
  e: EventoDePagamento,
): Promise<'novo' | 'duplicado'> {
  const { error } = await service.from('payment_webhook_events').insert({
    tenant_id: tenantId,
    provider,
    event_id: e.eventId,
    event_type: e.bruto,
    external_id: e.externalId,
  })
  if ((error as { code?: string } | null)?.code === '23505') return 'duplicado'
  if (error) erro(error)
  return 'novo'
}

export async function setWebhookOutcome(
  service: Client,
  tenantId: string,
  provider: PaymentProviderName,
  eventId: string,
  outcome: string,
): Promise<void> {
  await service
    .from('payment_webhook_events')
    .update({ outcome })
    .eq('tenant_id', tenantId)
    .eq('provider', provider)
    .eq('event_id', eventId)
}

/** Desfaz o registro quando o processamento falhou — para o reenvio do provedor tentar de novo. */
export async function forgetWebhookEvent(
  service: Client,
  tenantId: string,
  provider: PaymentProviderName,
  eventId: string,
): Promise<void> {
  await service
    .from('payment_webhook_events')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('provider', provider)
    .eq('event_id', eventId)
}

// ---------------------------------------------------------------------------
// Repasse
// ---------------------------------------------------------------------------

export async function listPayouts(client: Client, tenantId: string, contractId: string): Promise<OwnerPayout[]> {
  const { data, error } = await client
    .from('owner_payouts')
    .select(PAYOUT_SELECT)
    .eq('tenant_id', tenantId)
    .eq('contract_id', contractId)
    .order('competence', { ascending: false })
  if (error) erro(error)
  return ((data ?? []) as unknown as PayoutRow[]).map(toPayout)
}

/**
 * Repasse pendente de uma cobrança paga. Idempotente por
 * `cobranca:<id da cobrança>`: o mesmo pagamento processado duas vezes (webhook
 * e baixa manual quase juntos) não gera dois repasses.
 */
export async function createPayoutForCharge(
  service: Client,
  tenantId: string,
  d: {
    contractId: string
    competence: string
    chargeId: string
    destinationId: string | null
    scheduledFor: string
    bruto: number
    taxaAdm: number
    adminFeePercent: number | null
    /** Quantos estornos a cobrança já teve; 0 no caso comum. Ver `gerarRepasseSeQuitada`. */
    estornos: number
  },
): Promise<'ok' | 'duplicado'> {
  const { data, error } = await service
    .from('owner_payouts')
    .insert({
      tenant_id: tenantId,
      contract_id: d.contractId,
      competence: d.competence,
      destination_id: d.destinationId,
      scheduled_for: d.scheduledFor,
      idempotency_key: d.estornos ? `cobranca:${d.chargeId}:apos-estorno-${d.estornos}` : `cobranca:${d.chargeId}`,
    })
    .select('id')
    .single()
  if ((error as { code?: string } | null)?.code === '23505') return 'duplicado'
  if (error || !data) erro(error)

  const itens: Database['public']['Tables']['payout_items']['Insert'][] = [
    { tenant_id: tenantId, payout_id: data.id, kind: 'bruto', amount: d.bruto, source_charge_id: d.chargeId, description: 'Recebido do inquilino' },
  ]
  if (d.taxaAdm > 0) {
    itens.push({
      tenant_id: tenantId,
      payout_id: data.id,
      kind: 'taxa_adm',
      amount: -d.taxaAdm,
      source_charge_id: d.chargeId,
      description: `Taxa de administração (${d.adminFeePercent ?? 0}% do aluguel)`,
    })
  }
  const { error: itErr } = await service.from('payout_items').insert(itens)
  if (itErr) {
    // Cabeçalho sem itens é repasse de zero — pior que nenhum. Desfaz para a
    // próxima tentativa (reenvio do webhook) recriar inteiro.
    await service.from('owner_payouts').delete().eq('tenant_id', tenantId).eq('id', data.id)
    erro(itErr)
  }
  return 'ok'
}

export async function markPayoutPaid(service: Client, tenantId: string, payoutId: string): Promise<boolean> {
  const { data, error } = await service
    .from('owner_payouts')
    .update({ paid_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('id', payoutId)
    .is('paid_at', null)
    .is('canceled_at', null)
    .select('id')
  if (error) erro(error)
  return (data ?? []).length > 0
}

/**
 * Repasses ainda de pé (não cancelados) que saíram desta cobrança. Pelo item,
 * e não pela chave de idempotência: a chave muda depois de um estorno, o
 * `source_charge_id` não.
 */
export async function listActivePayoutsForCharge(
  service: Client,
  tenantId: string,
  chargeId: string,
): Promise<{ id: string; paidAt: string | null }[]> {
  const { data, error } = await service
    .from('owner_payouts')
    .select('id, paid_at, payout_items!inner(source_charge_id)')
    .eq('tenant_id', tenantId)
    .eq('payout_items.source_charge_id', chargeId)
    .is('canceled_at', null)
  if (error) erro(error)
  return ((data ?? []) as { id: string; paid_at: string | null }[]).map((r) => ({ id: r.id, paidAt: r.paid_at }))
}

/**
 * Cancela um repasse que ainda não saiu. `false` quando ele já foi pago (ou
 * cancelado) — inclusive se alguém clicou "Marcar como pago" entre a leitura e
 * este update: o `is('paid_at', null)` é a trava.
 */
export async function cancelPendingPayout(
  service: Client,
  tenantId: string,
  payoutId: string,
  reason: string,
  userId: string | null,
): Promise<boolean> {
  const { data, error } = await service
    .from('owner_payouts')
    .update({ canceled_at: new Date().toISOString(), canceled_by: userId, cancel_reason: reason })
    .eq('tenant_id', tenantId)
    .eq('id', payoutId)
    .is('paid_at', null)
    .is('canceled_at', null)
    .select('id')
  if (error) erro(error)
  return (data ?? []).length > 0
}

/** Destino ativo do proprietário, gravado NO repasse (0041: o extrato antigo aponta para onde o dinheiro foi). */
export async function activeDestinationId(service: Client, tenantId: string, portalUserId: string): Promise<string | null> {
  const { data, error } = await service
    .from('payout_destinations')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('portal_user_id', portalUserId)
    .eq('active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) erro(error)
  return data?.id ?? null
}
