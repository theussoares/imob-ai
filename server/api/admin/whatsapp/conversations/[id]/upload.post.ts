import { randomUUID } from 'node:crypto'
import { janelaAberta, prefixoDeEnvio, problemaNoAnexo, caminhoDaMidia } from '~~/shared/models/whatsapp'
import { getConversationState } from '~~/server/repositories/whatsapp.repository'
import { BUCKET_MIDIA } from '~~/server/utils/whatsapp-midia'

/**
 * Primeiro passo do envio de arquivo: uma URL de upload de uso único para o
 * navegador subir DIRETO no bucket.
 *
 * Direto, e não pelo servidor: a função da Vercel aceita no máximo 4,5 MB de
 * corpo, e um vídeo de 12 MB passando por aqui falharia com 413 sem chegar ao
 * código. O servidor decide O CAMINHO (pasta do tenant e da conversa, nome
 * aleatório) — o navegador só escolhe o conteúdo, e o bucket confere tamanho
 * e formato (0060).
 *
 * A URL de upload é assinada pela service_role porque o membro não tem policy
 * de escrita no bucket, de propósito: com ela, ele escreveria em qualquer
 * caminho da própria pasta, inclusive por cima de um arquivo recebido.
 */
export default defineEventHandler(async (event) => {
  const { client, tenant } = await requireTenantMember(event)
  await exigirWhatsapp(tenant.id)
  const id = idDeRota(getRouterParam(event, 'id'))
  const body = await readBody<{ mime?: unknown; size?: unknown }>(event)
  const mime = typeof body?.mime === 'string' ? body.mime : ''
  const size = typeof body?.size === 'number' ? body.size : 0

  const problema = problemaNoAnexo(mime, size)
  if (problema) throw createError({ statusCode: 422, statusMessage: problema })

  const state = await getConversationState(client, tenant.id, id)
  if (!state) throw createError({ statusCode: 404, statusMessage: 'Conversa não encontrada.' })
  // Checado já aqui, e não só no envio: subir 15 MB para descobrir depois que
  // a janela fechou é o tipo de espera que faz a pessoa desistir do painel.
  if (!janelaAberta(state.lastInboundAt, new Date())) {
    throw createError({ statusCode: 422, statusMessage: 'Passaram 24h desde a última mensagem do cliente. Arquivo só pode ser enviado com a conversa aberta.' })
  }

  const caminho = caminhoDaMidia(tenant.id, id, 'out-' + randomUUID(), mime)
  if (!caminho.startsWith(prefixoDeEnvio(tenant.id, id))) throw createError({ statusCode: 500, statusMessage: 'Caminho inválido.' })
  const { data, error } = await serviceSupabase().storage.from(BUCKET_MIDIA).createSignedUploadUrl(caminho)
  if (error || !data?.token) {
    logError('whatsapp.upload_url_falhou', { tenant: tenant.slug, reason: error?.message })
    throw createError({ statusCode: 502, statusMessage: 'Não foi possível preparar o envio do arquivo.' })
  }
  return { path: data.path, token: data.token }
})
