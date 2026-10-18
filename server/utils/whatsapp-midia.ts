import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~~/shared/types/database.types'
import type { WhatsappMediaStatus } from '~~/shared/models/whatsapp'
import { WHATSAPP_MIDIA_MAX_BYTES, WHATSAPP_MIDIA_MIMES, caminhoDaMidia, mimeBase } from '~~/shared/models/whatsapp'
import type { WhatsappAccountRecord } from '~~/server/mappers/whatsapp.mapper'
import { updateMessageMedia } from '~~/server/repositories/whatsapp.repository'
import { cloudApi } from '~~/server/services/whatsapp/cloud-api'
import { MidiaGrandeDemais, type Conexao } from '~~/server/services/whatsapp/provider'

type Client = SupabaseClient<Database>

export const BUCKET_MIDIA = 'whatsapp-media'

export interface MidiaPendente {
  messageId: string
  conversationId: string
  mediaId: string
}

/**
 * Baixa da Meta e guarda no bucket privado. Devolve o status gravado.
 *
 * Nunca lança: é chamada no webhook, depois de a mensagem estar salva, e uma
 * foto que não baixou não pode derrubar a mensagem — ela fica 'falhou' e o
 * painel tenta de novo quando alguém abrir.
 */
export async function salvarMidia(
  service: Client,
  conexao: Conexao,
  tenantId: string,
  m: MidiaPendente,
  prazoMs: number,
): Promise<WhatsappMediaStatus> {
  let status: WhatsappMediaStatus = 'falhou'
  let enviado: string | null = null
  try {
    const baixada = await cloudApi().baixarMidia(conexao, m.mediaId, WHATSAPP_MIDIA_MAX_BYTES, prazoMs)
    const mime = mimeBase(baixada.mime)
    if (!WHATSAPP_MIDIA_MIMES.includes(mime)) {
      // O bucket recusaria; registrar o tipo ajuda a decidir se entra na lista.
      logWarn('whatsapp.midia_formato_fora_da_lista', { tenant: tenantId, mime })
      await updateMessageMedia(service, tenantId, m.messageId, { media_status: 'falhou', media_mime: mime })
      return 'falhou'
    }
    const caminho = caminhoDaMidia(tenantId, m.conversationId, m.messageId, mime)
    const { error } = await service.storage.from(BUCKET_MIDIA).upload(caminho, baixada.bytes, { contentType: mime, upsert: true })
    if (error) throw error
    enviado = caminho
    await updateMessageMedia(service, tenantId, m.messageId, {
      media_status: 'salva',
      media_path: caminho,
      media_size: baixada.bytes.byteLength,
      media_mime: mime,
    })
    status = 'salva'
  } catch (e) {
    status = e instanceof MidiaGrandeDemais ? 'grande_demais' : 'falhou'
    if (status === 'falhou') logWarn('whatsapp.midia_nao_baixada', { tenant: tenantId, reason: errMessage(e) })
    // Subiu mas o caminho não foi gravado: a retenção acha arquivo pela coluna,
    // e este ficaria no bucket para sempre. Remove; a próxima tentativa sobe
    // de novo (achado da revisão de 29/09).
    if (enviado) {
      const { error: e3 } = await service.storage.from(BUCKET_MIDIA).remove([enviado])
      if (e3) logError('whatsapp.midia_orfa', { tenant: tenantId, reason: e3.message })
    }
    try {
      await updateMessageMedia(service, tenantId, m.messageId, { media_status: status })
    } catch (e2) {
      logError('whatsapp.midia_status_nao_gravado', { tenant: tenantId, reason: errMessage(e2) })
    }
  }
  return status
}

/**
 * As mídias que chegaram num webhook, dentro de um prazo.
 *
 * O prazo existe porque a Meta espera a resposta do webhook, e uma resposta
 * lenta vira reenvio. O que não couber fica 'pendente' e é baixado quando
 * alguém abrir a conversa — a Meta mantém o arquivo por semanas, não minutos.
 */
export async function baixarMidiasDoWebhook(
  service: Client,
  conta: WhatsappAccountRecord,
  pendentes: MidiaPendente[],
  ateQuando: number,
): Promise<void> {
  if (!pendentes.length || !conta.accessTokenEnc) return
  let conexao: Conexao
  try {
    conexao = { phoneNumberId: conta.phoneNumberId, wabaId: conta.wabaId, accessToken: decifrar(conta.accessTokenEnc) }
  } catch (e) {
    logError('whatsapp.midia_token_ilegivel', { tenant: conta.tenantId, reason: errMessage(e) })
    return
  }
  for (const m of pendentes) {
    const resta = ateQuando - Date.now()
    if (resta < 1500) return
    await salvarMidia(service, conexao, conta.tenantId, m, resta)
  }
}
