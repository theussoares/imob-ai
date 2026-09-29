import { janelaAberta, previa } from '~~/shared/models/whatsapp'
import {
  getAccountById,
  getConversationState,
  insertMessage,
  updateConversation,
} from '~~/server/repositories/whatsapp.repository'
import { cloudApi } from '~~/server/services/whatsapp/cloud-api'
import { ErroDoWhatsapp } from '~~/server/services/whatsapp/provider'
import { respostaPatch } from '~~/server/utils/whatsapp-inbox'

/**
 * Responde pelo painel.
 *
 * A mensagem só é gravada DEPOIS de a Meta confirmar com um `wamid`: gravar
 * antes e marcar falha depois deixaria, num timeout, uma mensagem "enviada" no
 * histórico que o cliente nunca recebeu — e o histórico é prova de atendimento.
 */
export default defineEventHandler(async (event) => {
  const { client, tenant, user } = await requireTenantMember(event)
  await exigirWhatsapp(tenant.id)
  const id = idDeRota(getRouterParam(event, 'id'))
  const body = await readBody<{ text: string }>(event)
  assertWhatsappTexto(body)
  const texto = body.text.trim()

  const state = await getConversationState(client, tenant.id, id)
  if (!state) throw createError({ statusCode: 404, statusMessage: 'Conversa não encontrada.' })

  const agora = new Date()
  if (!janelaAberta(state.lastInboundAt, agora)) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Passaram 24h desde a última mensagem do cliente. Pela regra do WhatsApp, só dá para retomar com um modelo aprovado.',
    })
  }

  const service = serviceSupabase()
  const conta = await getAccountById(service, tenant.id, state.accountId)
  if (!conta?.ativo || !conta.accessTokenEnc) {
    throw createError({ statusCode: 409, statusMessage: 'O número do WhatsApp está desconectado. Reconecte em Configurações.' })
  }

  let wamid: string
  try {
    ;({ wamid } = await cloudApi().enviarTexto(
      { phoneNumberId: conta.phoneNumberId, wabaId: conta.wabaId, accessToken: decifrar(conta.accessTokenEnc) },
      state.waId,
      texto,
    ))
  } catch (e) {
    if (e instanceof ErroDoWhatsapp) {
      logWarn('whatsapp.envio_recusado', { tenant: tenant.slug, credencial: e.credencialInvalida, janela: e.foraDaJanela })
      throw createError({
        statusCode: e.foraDaJanela ? 422 : 502,
        statusMessage: e.foraDaJanela
          ? 'Passaram 24h desde a última mensagem do cliente. Só dá para retomar com um modelo aprovado.'
          : e.credencialInvalida
            ? 'A Meta recusou o token do número. Reconecte o WhatsApp em Configurações.'
            : `O WhatsApp não aceitou a mensagem: ${e.message}`,
      })
    }
    throw e
  }

  const quando = agora.toISOString()
  await insertMessage(service, tenant.id, {
    conversationId: id,
    wamid,
    direction: 'out',
    origin: 'painel',
    type: 'text',
    body: texto,
    status: 'enviada',
    sentBy: user.id,
    occurredAt: quando,
  })
  await updateConversation(service, tenant.id, id, respostaPatch(state, quando, previa('text', texto)))
  return { ok: true }
})
