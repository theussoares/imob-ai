import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~~/shared/types/database.types'
import type { Charge, ManualSettlementInput, PaymentProviderName } from '~~/shared/models/cobranca'
import {
  VALOR_MINIMO_BOLETO,
  arred,
  calcularRepasse,
  hojeEmSaoPaulo,
  impedimentosDeEmissao,
  somar,
  somarDiasUteis,
} from '~~/shared/models/cobranca'
import { LEASE_DEFAULTS } from '~~/shared/models/lease'
import type { Tenant } from '~~/shared/models/tenant'
import type { PaymentAccountRow } from '~~/server/mappers/cobranca.mapper'
import { getContract, getContractInternal, listContractParties } from '~~/server/repositories/contract.repository'
import {
  activeDestinationId,
  cancelPendingPayout,
  createPayoutForCharge,
  forgetWebhookEvent,
  getCharge,
  getChargeByExternalId,
  getPaymentAccount,
  getPaymentCustomer,
  insertSettlement,
  listActivePayoutsForCharge,
  lockChargeForIssue,
  markChargeCanceled,
  markChargeIssued,
  registerWebhookEvent,
  reverseSettlements,
  savePaymentCustomer,
  setWebhookOutcome,
  unlockChargeIssue,
} from '~~/server/repositories/cobranca.repository'
import { criarAsaas } from '~~/server/services/payments/asaas'
import { criarSimulado } from '~~/server/services/payments/simulado'
import type { CobrancaEmitida, EventoDePagamento, PaymentProvider } from '~~/server/services/payments/provider'
import { ErroDoProvedor } from '~~/server/services/payments/provider'

type Client = SupabaseClient<Database>

/**
 * Os fluxos de dinheiro da cobrança (spec 25/09, B3). Cada função aqui é uma
 * regra que, errada, cobra ou repassa o valor errado — por isso moram fora dos
 * endpoints, testáveis com `fakeSupabase` e o provedor simulado.
 *
 * Duas clientes em jogo, sempre com o tenant da SESSÃO (ou do webhook
 * conferido) no filtro:
 *   - `client` do membro: LÊ contrato, partes e cobrança com RLS ligada;
 *   - `serviceSupabase()`: ESCREVE nas tabelas financeiras (0042 revogou a
 *     escrita do membro) e lê a conta do provedor (0051: só service_role).
 */

/** Instancia o adaptador da conta da imobiliária. A chave só existe decifrada aqui, em memória. */
export function provedorDaConta(conta: PaymentAccountRow): PaymentProvider {
  const ambiente = conta.environment === 'producao' ? 'producao' : 'sandbox'
  if (conta.provider === 'simulado') return criarSimulado(ambiente)
  if (!conta.api_key_ciphertext) throw createError({ statusCode: 409, statusMessage: 'Reconecte a conta do Asaas.' })
  return criarAsaas({ apiKey: decifrar(conta.api_key_ciphertext), ambiente })
}

/** Erro do provedor vira 502 com a mensagem dele (em português); o resto sobe como está. */
function comoErroHttp(e: unknown): never {
  if (e instanceof ErroDoProvedor) {
    throw createError({ statusCode: e.credencialInvalida ? 409 : 502, statusMessage: e.message })
  }
  throw e
}

function mesAno(competencia: string): string {
  const [a, m] = competencia.split('-')
  return `${m}/${a}`
}

/**
 * Emite a cobrança no provedor. A ordem é o que protege o dinheiro:
 *
 *   1. confere tudo o que dá para conferir sem rede (impedimentos);
 *   2. TRAVA a cobrança (`issued_at`) — o segundo clique não chega ao provedor;
 *   3. cliente e boleto no provedor;
 *   4. grava o que voltou e congela `issued_amount`.
 *
 * Falha em 3 desfaz a trava. Falha em 4 (o boleto EXISTE lá e não ficou
 * registrado aqui) cancela o boleto no provedor antes de desfazer a trava: um
 * boleto pagável que o sistema não conhece é pagamento que nunca baixa.
 */
export async function emitirCobranca(client: Client, tenant: Tenant, chargeId: string): Promise<Charge> {
  const service = serviceSupabase()
  const charge = await getCharge(client, tenant.id, chargeId)
  if (!charge) throw createError({ statusCode: 404, statusMessage: 'Cobrança não encontrada.' })
  const contrato = await getContract(client, tenant.id, charge.contractId)
  if (!contrato) throw createError({ statusCode: 404, statusMessage: 'Contrato não encontrado.' })
  const [interno, partes, conta] = await Promise.all([
    getContractInternal(client, contrato.id),
    listContractParties(client, tenant.id, contrato.id),
    getPaymentAccount(service, tenant.id),
  ])
  const inquilino = partes.find((p) => p.role === 'inquilino')

  const impedimentos = impedimentosDeEmissao({
    status: charge.status,
    total: charge.total,
    inquilinoTemDocumento: !!inquilino?.doc,
    contaConfigurada: !!conta,
  })
  if (!inquilino) impedimentos.unshift('Vincule o inquilino ao contrato.')
  if (charge.total > 0 && charge.total < VALOR_MINIMO_BOLETO) {
    impedimentos.push(`O valor mínimo de um boleto é R$ ${VALOR_MINIMO_BOLETO},00.`)
  }
  if (charge.dueOn < hojeEmSaoPaulo()) {
    impedimentos.push('O vencimento já passou. Apague o rascunho e gere de novo com outra data.')
  }
  if (impedimentos.length) throw createError({ statusCode: 422, statusMessage: impedimentos.join(' ') })

  if (!(await lockChargeForIssue(service, tenant.id, charge.id))) {
    throw createError({ statusCode: 409, statusMessage: 'Esta cobrança já está sendo emitida.' })
  }

  const provedor = provedorDaConta(conta!)
  let emitida: CobrancaEmitida | null = null
  try {
    let clienteExterno = await getPaymentCustomer(service, tenant.id, inquilino!.portalUserId, provedor.nome, provedor.ambiente)
    if (!clienteExterno) {
      clienteExterno = (
        await provedor.criarCliente({
          nome: inquilino!.nome,
          documento: inquilino!.doc!,
          email: inquilino!.email,
          telefone: inquilino!.telefone,
          referencia: inquilino!.portalUserId,
        })
      ).externalId
      await savePaymentCustomer(service, tenant.id, inquilino!.portalUserId, provedor.nome, provedor.ambiente, clienteExterno)
    }

    // Sem padrão legal: contrato sem multa/juros emite sem multa/juros (spec
    // B3.3 — a taxa legal supletiva está pendente de advogado).
    const multa = interno?.finePercent ?? null
    const juros = interno?.interestMonthlyPercent ?? null
    emitida = await provedor.emitir({
      clienteExterno,
      valor: charge.total,
      vencimento: charge.dueOn,
      descricao: [
        `Aluguel ${mesAno(charge.competence)}`,
        contrato.code,
        contrato.addressLabel,
      ]
        .filter(Boolean)
        .join(' · '),
      referencia: charge.id,
      multaPercent: multa,
      jurosMensalPercent: juros,
    })
    await markChargeIssued(service, tenant.id, charge.id, {
      amount: charge.total,
      provider: provedor.nome,
      environment: provedor.ambiente,
      finePercent: multa,
      interestMonthlyPercent: juros,
      emitida,
    })
  } catch (e) {
    if (emitida) {
      try {
        await provedor.cancelar(emitida.externalId)
      } catch (e2) {
        // O pior caso: boleto vivo lá, desconhecido aqui. Fica no log com o id
        // para alguém cancelar à mão no painel do provedor.
        logError('cobranca.boleto_orfao', { tenant: tenant.slug, externalId: emitida.externalId, reason: errMessage(e2) })
      }
    }
    await unlockChargeIssue(service, tenant.id, charge.id)
    comoErroHttp(e)
  }

  return (await getCharge(service, tenant.id, charge.id))!
}

/**
 * Cancela. Com boleto no provedor, cancela LÁ primeiro: se o provedor falha,
 * nada muda aqui. A ordem inversa deixaria um boleto pagável com a cobrança
 * cancelada — o inquilino paga e o dinheiro não tem para onde baixar.
 */
export async function cancelarCobranca(
  client: Client,
  tenant: Tenant,
  chargeId: string,
  motivo: string | null,
  userId: string,
): Promise<Charge> {
  const service = serviceSupabase()
  const charge = await getCharge(client, tenant.id, chargeId)
  if (!charge) throw createError({ statusCode: 404, statusMessage: 'Cobrança não encontrada.' })
  if (charge.status === 'cancelada') return charge
  if (charge.status === 'paga' || charge.status === 'parcial') {
    throw createError({
      statusCode: 422,
      statusMessage: 'Esta cobrança já recebeu pagamento. Registre um estorno em vez de cancelar.',
    })
  }
  if (charge.status === 'emitindo') {
    // Trava de emissão parada há minutos = o servidor caiu no meio. Liberar é
    // decisão humana: pode existir um boleto no provedor que não chegou aqui.
    const minutos = charge.issuedAt ? (Date.now() - Date.parse(charge.issuedAt)) / 60_000 : 99
    if (minutos < 5) throw createError({ statusCode: 409, statusMessage: 'A emissão está em andamento. Aguarde um instante.' })
  }

  if (charge.provider && charge.externalId) {
    const conta = await getPaymentAccount(service, tenant.id)
    if (!conta || conta.provider !== charge.provider || conta.environment !== charge.providerEnvironment) {
      throw createError({
        statusCode: 409,
        statusMessage: 'O boleto foi emitido por outra conta de cobrança. Cancele-o no painel do provedor e tente de novo.',
      })
    }
    try {
      await provedorDaConta(conta).cancelar(charge.externalId)
    } catch (e) {
      comoErroHttp(e)
    }
  }
  await markChargeCanceled(service, tenant.id, charge.id, motivo?.trim() || null, userId)
  return (await getCharge(service, tenant.id, charge.id))!
}

/**
 * Baixa manual — o inquilino pagou por fora (Pix direto, dinheiro).
 *
 * Com boleto emitido no provedor, o valor precisa quitar o saldo: o provedor
 * só sabe baixar o boleto INTEIRO. Aceitar parcial deixaria o boleto
 * original pagável pelo valor cheio, e o inquilino que paga os dois pagou em
 * dobro. Para parcial, cancela-se o boleto e emite-se outro com o saldo.
 *
 * Rascunho que recebe baixa é congelado no ato (`issued_amount` = total):
 * é o modelo "a imobiliária recebe por fora e o sistema REGISTRA" (0041).
 */
export async function baixarManualmente(
  client: Client,
  tenant: Tenant,
  chargeId: string,
  input: ManualSettlementInput,
  userId: string,
): Promise<Charge> {
  const service = serviceSupabase()
  const charge = await getCharge(client, tenant.id, chargeId)
  if (!charge) throw createError({ statusCode: 404, statusMessage: 'Cobrança não encontrada.' })
  if (charge.status === 'cancelada') throw createError({ statusCode: 422, statusMessage: 'Cobrança cancelada não recebe baixa.' })
  if (charge.status === 'paga') throw createError({ statusCode: 422, statusMessage: 'Esta cobrança já está paga.' })
  if (charge.status === 'emitindo') throw createError({ statusCode: 409, statusMessage: 'A emissão está em andamento. Aguarde um instante.' })
  if (input.settledOn > hojeEmSaoPaulo()) {
    throw createError({ statusCode: 422, statusMessage: 'A data do pagamento não pode ser futura.' })
  }

  const saldo = arred(charge.total - charge.settledTotal)
  if (charge.provider && charge.externalId) {
    if (input.amount + 0.001 < saldo) {
      throw createError({
        statusCode: 422,
        statusMessage: `Com boleto emitido, a baixa precisa quitar o saldo (R$ ${saldo.toFixed(2).replace('.', ',')}). Para receber só uma parte, cancele o boleto e emita outro com o restante.`,
      })
    }
    const conta = await getPaymentAccount(service, tenant.id)
    if (conta && conta.provider === charge.provider && conta.environment === charge.providerEnvironment) {
      try {
        await provedorDaConta(conta).baixarPorFora(charge.externalId, input.amount, input.settledOn)
      } catch (e) {
        comoErroHttp(e)
      }
    } else {
      throw createError({
        statusCode: 409,
        statusMessage: 'O boleto foi emitido por outra conta de cobrança. Dê a baixa no painel do provedor.',
      })
    }
  }

  if (charge.status === 'rascunho') {
    const { error } = await service
      .from('contract_charges')
      .update({ issued_amount: charge.total, issued_at: new Date().toISOString() })
      .eq('tenant_id', tenant.id)
      .eq('id', charge.id)
      .is('issued_at', null)
    if (error) throw error
  }

  // Com boleto no provedor, a MESMA chave que o webhook usaria: o provedor
  // avisa a baixa em dinheiro por webhook, e ele pode chegar antes desta
  // linha. Quem chegar segundo vira no-op, em vez de duas liquidações.
  await insertSettlement(service, tenant.id, charge.id, {
    amount: arred(input.amount),
    settledOn: input.settledOn,
    method: input.method,
    externalRef: null,
    idempotencyKey: charge.provider && charge.externalId ? `${charge.provider}:pago:${charge.externalId}` : null,
    createdBy: userId,
  })
  await gerarRepasseSeQuitada(service, tenant.id, charge.id)
  return (await getCharge(service, tenant.id, charge.id))!
}

/**
 * Cobrança paga → repasse PENDENTE ao proprietário (B3.8). Chamada depois de
 * toda liquidação; idempotente pela chave `cobranca:<id>`.
 *
 * Depois de um estorno a chave ganha o número de estornos. O repasse do
 * pagamento estornado foi cancelado, mas a linha continua lá com a chave
 * antiga (o índice único da 0042 não olha `canceled_at`); se a cobrança for
 * paga de novo, a mesma chave colidiria e o proprietário nunca receberia.
 *
 * Contrato sem proprietário vinculado não gera repasse: a imobiliária pode
 * ser a própria dona, ou o vínculo ainda não foi feito — a ficha já mostra
 * essa pendência.
 */
export async function gerarRepasseSeQuitada(service: Client, tenantId: string, chargeId: string): Promise<'criado' | 'nao_quitada' | 'sem_proprietario' | 'duplicado'> {
  const charge = await getCharge(service, tenantId, chargeId)
  if (!charge || charge.status !== 'paga') return 'nao_quitada'
  // `getContract` com o tenant no filtro ANTES de ler `contract_internal`,
  // que não tem tenant próprio e aqui é lido sem RLS.
  const contrato = await getContract(service, tenantId, charge.contractId)
  if (!contrato) return 'nao_quitada'
  const [interno, partes] = await Promise.all([
    getContractInternal(service, contrato.id),
    listContractParties(service, tenantId, contrato.id),
  ])
  const dono = partes.find((p) => p.role === 'proprietario')
  if (!dono) return 'sem_proprietario'

  const ultimaData = charge.settlements.map((s) => s.settledOn).sort().at(-1) ?? hojeEmSaoPaulo()
  const calculo = calcularRepasse(charge.items, charge.settledTotal, interno?.adminFeePercent ?? null)
  const r = await createPayoutForCharge(service, tenantId, {
    contractId: contrato.id,
    competence: charge.competence,
    chargeId: charge.id,
    destinationId: await activeDestinationId(service, tenantId, dono.portalUserId),
    scheduledFor: somarDiasUteis(ultimaData, interno?.payoutBusinessDays ?? LEASE_DEFAULTS.payoutBusinessDays),
    bruto: calculo.bruto,
    taxaAdm: calculo.taxaAdm,
    adminFeePercent: interno?.adminFeePercent ?? null,
    estornos: charge.settlements.filter((s) => s.amount < 0).length,
  })
  return r === 'ok' ? 'criado' : 'duplicado'
}

/**
 * Estorno → o repasse daquela cobrança não pode mais sair.
 *
 * Sem isto o estorno criava as linhas negativas e o repasse continuava
 * pendente: a imobiliária transferia ao proprietário um dinheiro que já tinha
 * voltado ao inquilino, e só descobria no extrato do Asaas.
 *
 * Repasse já pago não se desfaz por código — o dinheiro saiu da conta da
 * imobiliária por transferência manual (B3.8). Esse caso grita no log e volta
 * como `repasse_ja_pago`, para o diário do webhook dizer que falta uma ação
 * humana (cobrar o proprietário de volta, ou descontar no próximo repasse).
 *
 * Se a cobrança continua quitada depois do estorno (houve outro pagamento que
 * cobre o total), o repasse fica: o proprietário tem a receber do mesmo jeito.
 */
export async function cancelarRepasseSeEstornada(
  service: Client,
  tenantId: string,
  chargeId: string,
): Promise<'mantido' | 'cancelado' | 'sem_repasse' | 'repasse_ja_pago'> {
  const charge = await getCharge(service, tenantId, chargeId)
  if (!charge || charge.status === 'paga') return 'mantido'
  const repasses = await listActivePayoutsForCharge(service, tenantId, chargeId)
  if (!repasses.length) return 'sem_repasse'
  let jaPago = false
  for (const r of repasses) {
    const cancelou = !r.paidAt && (await cancelPendingPayout(service, tenantId, r.id, 'Pagamento estornado no provedor', null))
    if (!cancelou) {
      jaPago = true
      logError('cobranca.estorno_com_repasse_pago', { chargeId, payoutId: r.id })
    }
  }
  return jaPago ? 'repasse_ja_pago' : 'cancelado'
}

/**
 * Um evento do provedor, já normalizado e com o tenant CONFERIDO (pelo token
 * do webhook, nunca pelo corpo). Devolve o que foi feito, para o diário.
 *
 * Idempotência em duas camadas:
 *   - o diário (`payment_webhook_events`): evento repetido não é reprocessado;
 *   - a liquidação usa `<provedor>:pago:<id da cobrança lá>` — um pagamento,
 *     uma liquidação, mesmo que o provedor mande dois eventos diferentes para
 *     ele (no Asaas, CONFIRMED e depois RECEIVED no cartão).
 *
 * Se o processamento falha, o evento sai do diário e o erro sobe: o provedor
 * reenvia e a segunda tentativa encontra o caminho livre.
 */
export async function processarEventoDePagamento(
  service: Client,
  tenantId: string,
  provider: PaymentProviderName,
  evento: EventoDePagamento,
): Promise<string> {
  if ((await registerWebhookEvent(service, tenantId, provider, evento)) === 'duplicado') return 'duplicado'
  try {
    const outcome = await aplicarEvento(service, tenantId, provider, evento)
    await setWebhookOutcome(service, tenantId, provider, evento.eventId, outcome)
    return outcome
  } catch (e) {
    await forgetWebhookEvent(service, tenantId, provider, evento.eventId)
    throw e
  }
}

async function aplicarEvento(service: Client, tenantId: string, provider: PaymentProviderName, e: EventoDePagamento): Promise<string> {
  if (!e.externalId) return 'ignorado'
  if (e.tipo === 'vencido' || e.tipo === 'outro') return 'ignorado'

  const charge = await getChargeByExternalId(service, tenantId, provider, e.externalId)
  if (!charge) {
    // Boleto emitido fora do sistema, direto no painel do provedor. Não é
    // erro: fica no diário para alguém olhar.
    logWarn('cobranca.evento_sem_cobranca', { provider, externalId: e.externalId, tipo: e.tipo })
    return 'sem_cobranca'
  }

  if (e.tipo === 'pago') {
    // Eco da nossa própria baixa manual (receiveInCash): a chave de
    // idempotência abaixo é a mesma que a baixa usou, então o insert vira
    // no-op sozinho. O atalho só poupa a escrita.
    if (e.emDinheiro && charge.status === 'paga') return 'eco_baixa_manual'
    const r = await insertSettlement(service, tenantId, charge.id, {
      amount: e.valor,
      settledOn: e.data,
      method: e.metodo,
      externalRef: e.externalId,
      idempotencyKey: `${provider}:pago:${e.externalId}`,
      createdBy: null,
    })
    if (r === 'duplicada') return 'liquidacao_ja_registrada'
    if (charge.status === 'cancelada') {
      // Pago depois de cancelado (corrida com o cancelamento no provedor). O
      // dinheiro entrou: registra e grita, alguém precisa devolver ou reativar.
      logError('cobranca.paga_apos_cancelamento', { chargeId: charge.id, externalId: e.externalId })
      return 'paga_apos_cancelamento'
    }
    await gerarRepasseSeQuitada(service, tenantId, charge.id)
    return 'liquidada'
  }

  if (e.tipo === 'cancelado') {
    if (charge.status === 'cancelada') return 'ja_cancelada'
    if (somar(charge.settlements.map((s) => s.amount)) > 0) return 'ignorado_ja_paga'
    await markChargeCanceled(service, tenantId, charge.id, 'Removida no painel do provedor', null)
    return 'cancelada'
  }

  if (e.tipo === 'estornado') {
    const n = await reverseSettlements(service, tenantId, charge, e.data, `${provider}:estorno:${e.externalId}`)
    if (n) logWarn('cobranca.estornada', { chargeId: charge.id, liquidacoes: n })
    // Roda mesmo com `n === 0`: se a tentativa anterior caiu entre as linhas
    // negativas e o repasse, o reenvio encontra o estorno já gravado e é aqui
    // que o repasse ainda é cancelado.
    const repasse = await cancelarRepasseSeEstornada(service, tenantId, charge.id)
    if (repasse === 'repasse_ja_pago') return 'estornada_repasse_ja_pago'
    return n ? 'estornada' : 'estorno_ja_registrado'
  }
  return 'ignorado'
}
