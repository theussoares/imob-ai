import { ehUuid } from '~~/shared/utils/uuid'
import { getPaymentAccountByWebhookId } from '~~/server/repositories/cobranca.repository'
import { eventoDoAsaas } from '~~/server/services/payments/asaas'

/**
 * Webhook do Asaas. Rota pública: quem chama é o Asaas, sem sessão.
 *
 * De quem é o evento sai da URL (`webhook_id`, público) e é PROVADO pelo
 * cabeçalho `asaas-access-token`, comparado em tempo constante contra o hash
 * guardado. O corpo nunca decide o tenant (invariante nº 1): `externalReference`
 * e `customer` só são usados depois, contra cobranças já filtradas pelo tenant
 * que a URL provou.
 *
 * Respostas:
 *   - 404 para URL desconhecida e 401 para segredo errado — o Asaas marca
 *     erro, e é o que queremos para um webhook mal configurado;
 *   - 200 para tudo que foi entendido, INCLUSIVE evento repetido ou que não
 *     nos interessa. O Asaas pausa a fila da conta depois de falhas
 *     seguidas, e uma fila pausada para de avisar pagamento de verdade;
 *   - 500 só quando a gravação falhou: aí o reenvio é desejado.
 */
export default defineEventHandler(async (event) => {
  const hookId = getRouterParam(event, 'hookId') || ''
  if (!ehUuid(hookId)) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const service = serviceSupabase()
  const conta = await getPaymentAccountByWebhookId(service, hookId)
  if (!conta || conta.provider !== 'asaas' || !conta.webhook_secret_hash) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  const token = getHeader(event, 'asaas-access-token') || ''
  if (!token || !mesmoSegredo(hashDeSegredo(token), conta.webhook_secret_hash)) {
    logWarn('cobranca.webhook_recusado', { reason: 'token' })
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const evento = eventoDoAsaas(await readBody(event))
  if (!evento) return { ok: true, resultado: 'ignorado' }

  try {
    const resultado = await processarEventoDePagamento(service, conta.tenant_id, 'asaas', evento)
    return { ok: true, resultado }
  } catch (e) {
    logError('cobranca.webhook_falhou', { evento: evento.bruto, reason: errMessage(e) })
    throw createError({ statusCode: 500, statusMessage: 'Falha ao processar' })
  }
})
