import { randomUUID } from 'node:crypto'
import type { PaymentAccountInput } from '~~/shared/models/cobranca'
import { getPaymentAccount, savePaymentAccount } from '~~/server/repositories/cobranca.repository'
import { toPaymentAccountView } from '~~/server/mappers/cobranca.mapper'
import { criarAsaas } from '~~/server/services/payments/asaas'
import { ErroDoProvedor } from '~~/server/services/payments/provider'

/**
 * Conecta (ou troca) a conta de cobrança.
 *
 * Só o DONO: a chave move o dinheiro da imobiliária, e um `admin` convidado
 * para cuidar do site não deveria poder apontar os boletos para outra conta.
 *
 * Para o Asaas, antes de gravar: confere a chave (um 401 aqui é melhor que no
 * primeiro boleto) e registra o webhook com um segredo NOVO, que só existe na
 * memória desta requisição e no Asaas — aqui fica o hash. A URL do webhook
 * também é nova a cada conexão: um webhook antigo que não pôde ser removido
 * passa a bater num id que não existe mais, em vez de continuar valendo.
 */
export default defineEventHandler(async (event) => {
  const { tenant, user, membership } = await requireTenantMember(event)
  await exigirCobranca(tenant.id)
  if (membership.role !== 'owner') {
    throw createError({ statusCode: 403, statusMessage: 'Só o responsável pela conta da imobiliária pode conectar a cobrança.' })
  }
  const body = await readBody<PaymentAccountInput>(event)
  assertPaymentAccountInput(body)

  const service = serviceSupabase()
  const anterior = await getPaymentAccount(service, tenant.id)
  const webhookId = randomUUID()

  if (body.provider === 'simulado') {
    await removerWebhookAnterior(anterior, tenant.slug)
    const salva = await savePaymentAccount(service, tenant.id, {
      provider: 'simulado',
      environment: 'sandbox',
      apiKeyCiphertext: null,
      apiKeyLast4: null,
      accountName: 'Conta de demonstração',
      webhookId,
      webhookSecretHash: null,
      externalWebhookId: null,
      connectedBy: user.id,
    })
    return { conta: toPaymentAccountView(salva) }
  }

  const apiKey = body.apiKey!.trim()
  // Cifra ANTES de qualquer chamada: sem a chave-mestra configurada, falha
  // aqui com 503 legível, e não depois de ter criado um webhook no Asaas.
  const cifrada = cifrar(apiKey)
  const asaas = criarAsaas({ apiKey, ambiente: body.environment })
  const segredo = novoSegredoDeWebhook()
  // O host de quem está conectando — o painel da própria imobiliária — e
  // sempre https: atrás do proxy da Vercel a requisição chega como http, e o
  // Asaas não segue o redirect de http para https num POST.
  const host = getRequestURL(event, { xForwardedHost: true }).host
  const url = `https://${host}/api/webhooks/asaas/${webhookId}`

  let nomeDaConta: string | null
  let externalWebhookId: string | null
  try {
    nomeDaConta = (await asaas.verificarConta()).nomeDaConta
    externalWebhookId = (await asaas.registrarWebhook(url, segredo, tenant.email ?? null)).externalId
  } catch (e) {
    if (e instanceof ErroDoProvedor) throw createError({ statusCode: 422, statusMessage: e.message })
    throw e
  }

  await removerWebhookAnterior(anterior, tenant.slug)
  const salva = await savePaymentAccount(service, tenant.id, {
    provider: 'asaas',
    environment: body.environment,
    apiKeyCiphertext: cifrada,
    apiKeyLast4: apiKey.slice(-4),
    accountName: nomeDaConta,
    webhookId,
    webhookSecretHash: hashDeSegredo(segredo),
    externalWebhookId,
    connectedBy: user.id,
  })
  return { conta: toPaymentAccountView(salva) }
})

/** Melhor esforço: a conta nova vale mesmo se a antiga não responder. */
async function removerWebhookAnterior(
  anterior: Awaited<ReturnType<typeof getPaymentAccount>>,
  tenantSlug: string,
): Promise<void> {
  if (!anterior || anterior.provider !== 'asaas' || !anterior.external_webhook_id) return
  try {
    await provedorDaConta(anterior).removerWebhook(anterior.external_webhook_id)
  } catch (e) {
    logWarn('cobranca.webhook_antigo_nao_removido', { tenant: tenantSlug, reason: errMessage(e) })
  }
}
