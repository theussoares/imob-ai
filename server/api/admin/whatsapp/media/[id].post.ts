import { getConversationState, getMessageMedia } from '~~/server/repositories/whatsapp.repository'
import { conexaoDaConversa } from '~~/server/utils/whatsapp-envio'
import { BUCKET_MIDIA, salvarMidia } from '~~/server/utils/whatsapp-midia'

/** Dez minutos: o tempo de ouvir um áudio longo sem a URL expirar no meio. */
const URL_TTL_SEGUNDOS = 600

/**
 * URL assinada para uma foto, áudio, vídeo ou documento da conversa.
 *
 * Se o webhook não teve tempo de baixar (ou falhou), baixa agora — é o
 * segundo caminho da mídia, e o que garante que ela aparece mesmo quando a
 * Meta respondeu devagar na hora em que a mensagem chegou.
 *
 * POST pelo mesmo motivo do documento do portal: prefetch e preview de link
 * não devem gerar URL assinada nem disparar download na Meta.
 *
 * Assinado com o client do MEMBRO: a policy `whatsapp_media_member_read`
 * (0060) confere a pasta do tenant de novo, no banco.
 */
export default defineEventHandler(async (event) => {
  const { client, tenant } = await requireTenantMember(event)
  await exigirWhatsapp(tenant.id)
  const id = idDeRota(getRouterParam(event, 'id'))

  let ref = await getMessageMedia(client, tenant.id, id)
  if (!ref) throw createError({ statusCode: 404, statusMessage: 'Arquivo não encontrado.' })
  if (ref.status === 'grande_demais') {
    throw createError({ statusCode: 410, statusMessage: 'Arquivo grande demais para guardar no painel. Abra no celular.' })
  }

  if (ref.status !== 'salva' || !ref.path) {
    const state = await getConversationState(client, tenant.id, ref.conversationId)
    if (!state) throw createError({ statusCode: 404, statusMessage: 'Arquivo não encontrado.' })
    const service = serviceSupabase()
    const { conexao } = await conexaoDaConversa(service, tenant.id, state.accountId)
    const status = await salvarMidia(service, conexao, tenant.id, { messageId: ref.messageId, conversationId: ref.conversationId, mediaId: ref.mediaId }, 20_000)
    if (status === 'grande_demais') {
      throw createError({ statusCode: 410, statusMessage: 'Arquivo grande demais para guardar no painel. Abra no celular.' })
    }
    ref = status === 'salva' ? await getMessageMedia(client, tenant.id, id) : null
    if (!ref?.path) {
      throw createError({ statusCode: 502, statusMessage: 'Não foi possível baixar o arquivo do WhatsApp. Tente de novo em instantes.' })
    }
  }

  const { data, error } = await client.storage
    .from(BUCKET_MIDIA)
    .createSignedUrl(ref.path!, URL_TTL_SEGUNDOS, ref.filename ? { download: nomeSeguro(ref.filename) } : undefined)
  if (error || !data?.signedUrl) {
    logError('whatsapp.midia_assinatura_falhou', { tenant: tenant.slug, reason: error?.message })
    throw createError({ statusCode: 502, statusMessage: 'Não foi possível abrir o arquivo.' })
  }
  return { url: data.signedUrl, mime: ref.mime, filename: ref.filename }
})

/** O nome que o cliente deu, só como nome de download — sem caminho nem controle. */
function nomeSeguro(nome: string): string {
  return nome.replace(/[\\/\u0000-\u001f"]/g, '_').slice(0, 120) || 'arquivo'
}
