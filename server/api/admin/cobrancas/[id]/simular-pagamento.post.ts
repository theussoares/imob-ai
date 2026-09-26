import { getCharge, getPaymentAccount } from '~~/server/repositories/cobranca.repository'

/**
 * "O inquilino pagou" — só em sandbox e no simulado, para demonstrar o fluxo
 * inteiro sem dinheiro de verdade.
 *
 * No Asaas sandbox, isto só PEDE a confirmação: a baixa chega pelo webhook,
 * pelo mesmo caminho de um pagamento real (é justamente o que se quer provar).
 * No simulado não há webhook, e o evento é processado aqui pela MESMA função.
 */
export default defineEventHandler(async (event) => {
  const { client, tenant } = await requireTenantMember(event)
  await exigirCobranca(tenant.id)
  const id = idDeRota(getRouterParam(event, 'id'))
  const charge = await getCharge(client, tenant.id, id)
  if (!charge) throw createError({ statusCode: 404, statusMessage: 'Cobrança não encontrada.' })
  if (!charge.externalId || !charge.provider) {
    throw createError({ statusCode: 422, statusMessage: 'Emita a cobrança antes de simular o pagamento.' })
  }
  if (charge.status === 'paga' || charge.status === 'cancelada') {
    throw createError({ statusCode: 422, statusMessage: 'Esta cobrança não está em aberto.' })
  }
  const service = serviceSupabase()
  const conta = await getPaymentAccount(service, tenant.id)
  // Trava em DUAS pontas: a conta de agora e a cobrança de então precisam ser
  // de teste. Uma conta trocada para produção depois da emissão não pode
  // "confirmar" um boleto real.
  if (!conta || conta.environment !== 'sandbox' || charge.providerEnvironment !== 'sandbox' || conta.provider !== charge.provider) {
    throw createError({ statusCode: 422, statusMessage: 'Simular pagamento só existe em conta de testes.' })
  }
  let evento
  try {
    evento = await provedorDaConta(conta).simularPagamento(charge.externalId, charge.total - charge.settledTotal)
  } catch (e) {
    throw createError({ statusCode: 502, statusMessage: errMessage(e) })
  }
  if (!evento) return { aguardandoWebhook: true, cobranca: charge }
  await processarEventoDePagamento(service, tenant.id, conta.provider as 'simulado', evento)
  return { aguardandoWebhook: false, cobranca: await getCharge(client, tenant.id, id) }
})
