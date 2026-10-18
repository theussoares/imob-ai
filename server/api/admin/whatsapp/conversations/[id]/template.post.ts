import type { WhatsappTemplateSendInput } from '~~/shared/models/whatsapp'
import { getConversationState } from '~~/server/repositories/whatsapp.repository'
import { cloudApi } from '~~/server/services/whatsapp/cloud-api'
import { conexaoDaConversa, erroDoEnvio, modeloParaEnviar, registrarSaida } from '~~/server/utils/whatsapp-envio'

/**
 * Envia um modelo aprovado numa conversa — o único jeito de falar com o
 * cliente depois das 24h. Vale também dentro da janela (a Meta aceita), mas a
 * tela só oferece fora dela: dentro, texto livre é de graça e mais humano.
 */
export default defineEventHandler(async (event) => {
  const { client, tenant, user } = await requireTenantMember(event)
  await exigirWhatsapp(tenant.id)
  const id = idDeRota(getRouterParam(event, 'id'))
  const body = await readBody<WhatsappTemplateSendInput>(event)
  assertWhatsappTemplateSend(body)

  const state = await getConversationState(client, tenant.id, id)
  if (!state) throw createError({ statusCode: 404, statusMessage: 'Conversa não encontrada.' })

  const service = serviceSupabase()
  const { conexao } = await conexaoDaConversa(service, tenant.id, state.accountId)
  const { modelo, texto } = await modeloParaEnviar(conexao, body, tenant.slug)
  let wamid: string
  try {
    ;({ wamid } = await cloudApi().enviarModelo(conexao, state.waId, modelo, body.values))
  } catch (e) {
    erroDoEnvio(e, tenant.slug)
  }
  await registrarSaida(service, tenant, user.id, state, { wamid, type: 'template', body: texto, modelo: modelo.name })
  return { ok: true }
})
