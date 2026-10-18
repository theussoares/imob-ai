import { janelaAberta } from '~~/shared/models/whatsapp'
import { getConversationState } from '~~/server/repositories/whatsapp.repository'
import { cloudApi } from '~~/server/services/whatsapp/cloud-api'
import { conexaoDaConversa, erroDoEnvio, registrarSaida } from '~~/server/utils/whatsapp-envio'

/**
 * Responde pelo painel, com texto livre — só dentro da janela de 24h.
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
  if (!janelaAberta(state.lastInboundAt, new Date())) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Passaram 24h desde a última mensagem do cliente. Pela regra do WhatsApp, só dá para retomar com um modelo aprovado.',
    })
  }

  const service = serviceSupabase()
  const { conexao } = await conexaoDaConversa(service, tenant.id, state.accountId)
  let wamid: string
  try {
    ;({ wamid } = await cloudApi().enviarTexto(conexao, state.waId, texto))
  } catch (e) {
    erroDoEnvio(e, tenant.slug)
  }
  await registrarSaida(service, tenant, user.id, state, { wamid, type: 'text', body: texto })
  return { ok: true }
})
