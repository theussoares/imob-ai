import { whatsappVerifyToken } from '~~/server/utils/whatsapp-config'

/**
 * Verificação do webhook, feita UMA vez pela Meta quando alguém cadastra a URL
 * no app: ela manda o texto combinado e espera o `hub.challenge` de volta,
 * cru, como texto.
 *
 * Token vazio recusa sempre: sem isto, com a variável ausente, qualquer um
 * mandando `hub.verify_token=` vazio passaria na comparação.
 */
export default defineEventHandler((event) => {
  const q = getQuery(event)
  const esperado = whatsappVerifyToken()
  const recebido = typeof q['hub.verify_token'] === 'string' ? q['hub.verify_token'] : ''

  if (q['hub.mode'] !== 'subscribe' || !esperado || !recebido || !mesmoSegredo(recebido, esperado)) {
    logWarn('whatsapp.webhook_verificacao_recusada', { temToken: Boolean(esperado) })
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }
  setHeader(event, 'content-type', 'text/plain; charset=utf-8')
  return String(q['hub.challenge'] ?? '')
})
