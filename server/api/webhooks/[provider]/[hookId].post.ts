import { ehUuid } from '~~/shared/utils/uuid'
import { getPaymentAccountByWebhookId } from '~~/server/repositories/cobranca.repository'
import { lerEventoDaCora, lerEventoDoAsaas } from '~~/server/services/payments/webhooks'

/**
 * Webhook de cobrança, um endpoint para todos os provedores
 * (`/api/webhooks/<provedor>/<webhookId>`). Rota pública: quem chama é o
 * provedor, sem sessão.
 *
 * De quem é o evento sai da URL (`webhook_id`, público) e o provedor da conta
 * tem de bater com o da URL. O corpo nunca decide o tenant (invariante nº 1).
 * A PROVA muda por provedor, e é a única regra de provedor que mora aqui:
 *   - Asaas: cabeçalho `asaas-access-token`, comparado em tempo constante com
 *     o hash guardado;
 *   - Cora: não assina nada. O `webhook_id` é um UUID aleatório por conexão e a
 *     informação vem da reconsulta na API (ver `lerEventoDaCora`).
 *
 * Respostas:
 *   - 404 para URL desconhecida e 401 para segredo errado — o provedor marca
 *     erro, e é o que queremos para um webhook mal configurado;
 *   - 200 para tudo que foi entendido, INCLUSIVE evento repetido ou que não
 *     nos interessa. O Asaas pausa a fila da conta depois de falhas
 *     seguidas, e uma fila pausada para de avisar pagamento de verdade;
 *   - 500 só quando a gravação falhou: aí o reenvio é desejado.
 */
export default defineEventHandler(async (event) => {
  const nome = getRouterParam(event, 'provider') || ''
  const hookId = getRouterParam(event, 'hookId') || ''
  if (!ehUuid(hookId) || (nome !== 'asaas' && nome !== 'cora')) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const service = serviceSupabase()
  const conta = await getPaymentAccountByWebhookId(service, hookId)
  if (!conta || conta.provider !== nome) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const entrada = {
    cabecalho: (n: string) => getHeader(event, n),
    corpo: () => readBody(event),
  }

  let evento
  try {
    if (nome === 'asaas') {
      if (!conta.webhook_secret_hash) throw createError({ statusCode: 404, statusMessage: 'Not found' })
      const token = getHeader(event, 'asaas-access-token') || ''
      if (!token || !mesmoSegredo(hashDeSegredo(token), conta.webhook_secret_hash)) {
        logWarn('cobranca.webhook_recusado', { reason: 'token' })
        throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
      }
      evento = await lerEventoDoAsaas(entrada)
    } else {
      evento = await lerEventoDaCora(entrada, provedorDaConta(conta))
    }
  } catch (e) {
    if ((e as { statusCode?: number }).statusCode) throw e
    // Reconsulta falhou (Cora fora do ar): 500 para ela reenviar depois.
    logError('cobranca.webhook_falhou', { provider: nome, reason: errMessage(e) })
    throw createError({ statusCode: 500, statusMessage: 'Falha ao processar' })
  }
  if (!evento) return { ok: true, resultado: 'ignorado' }

  try {
    const resultado = await processarEventoDePagamento(service, conta.tenant_id, nome, evento)
    return nome === 'cora' ? { success: true, resultado } : { ok: true, resultado }
  } catch (e) {
    logError('cobranca.webhook_falhou', { evento: evento.bruto, reason: errMessage(e) })
    throw createError({ statusCode: 500, statusMessage: 'Falha ao processar' })
  }
})
