import { assinaturaValida, lotesDoWebhook } from '~~/server/services/whatsapp/cloud-api'
import { getAccountByPhoneNumberId } from '~~/server/repositories/whatsapp.repository'
import { processarLoteWhatsapp } from '~~/server/utils/whatsapp-inbox'
import { whatsappAppSecret } from '~~/server/utils/whatsapp-config'
import { baixarMidiasDoWebhook } from '~~/server/utils/whatsapp-midia'

/**
 * Webhook da Meta: mensagens, ecos do Coexistence e status de entrega, de
 * TODAS as imobiliárias — a Meta aceita um callback por app.
 *
 * De quem é o evento sai do `phone_number_id` do corpo, depois de a
 * assinatura provar que o corpo veio da Meta. Nunca do Host: o Host desta
 * requisição é o nosso domínio, o mesmo para todo tenant (invariante nº 1).
 *
 * Respostas (spec, regra 7):
 *   - 401 para assinatura errada;
 *   - 200 para tudo que foi entendido, INCLUSIVE repetido, de número
 *     desconhecido ou desconectado. A Meta desliga o webhook do app depois de
 *     falhas seguidas, e um app desligado para de entregar a conversa de
 *     todas as imobiliárias;
 *   - 500 só quando a gravação falhou: aí o reenvio é desejado.
 */
/**
 * Quanto do tempo da requisição a mídia pode usar. A Meta espera a resposta
 * em segundos; o que não couber fica para o painel baixar ao abrir.
 */
const PRAZO_DA_MIDIA_MS = 8000

export default defineEventHandler(async (event) => {
  const inicio = Date.now()
  const cru = (await readRawBody(event, 'utf8')) ?? ''
  if (!assinaturaValida(cru, getHeader(event, 'x-hub-signature-256'), whatsappAppSecret())) {
    logWarn('whatsapp.webhook_recusado', { reason: 'assinatura' })
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  let payload: unknown
  try {
    payload = JSON.parse(cru)
  } catch {
    return { ok: true, resultado: 'ignorado' }
  }

  const service = serviceSupabase()
  for (const lote of lotesDoWebhook(payload)) {
    const conta = await getAccountByPhoneNumberId(service, lote.phoneNumberId)
    if (!conta || !conta.ativo) {
      logWarn('whatsapp.webhook_numero_desconhecido', { conectado: Boolean(conta) })
      continue
    }
    let midias
    try {
      midias = await processarLoteWhatsapp(service, conta, lote)
    } catch (e) {
      logError('whatsapp.webhook_falhou', { tenant: conta.tenantId, reason: errMessage(e) })
      throw createError({ statusCode: 500, statusMessage: 'Falha ao processar' })
    }
    // Depois de gravar, e fora do try: a mídia nunca faz o webhook responder
    // 500 — o reenvio seria ignorado pelo `wamid` e a foto não viria de novo.
    await baixarMidiasDoWebhook(service, conta, midias, inicio + PRAZO_DA_MIDIA_MS)
  }
  return { ok: true }
})
