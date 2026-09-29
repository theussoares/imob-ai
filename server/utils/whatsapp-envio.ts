import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~~/shared/types/database.types'
import type { WhatsappTemplateSendInput } from '~~/shared/models/whatsapp'
import { preencherModelo, previa, problemaNoValor } from '~~/shared/models/whatsapp'
import type { WhatsappAccountRecord } from '~~/server/mappers/whatsapp.mapper'
import { getAccountById, getActiveAccount, insertMessage, updateConversation, type ConversationState } from '~~/server/repositories/whatsapp.repository'
import { cloudApi } from '~~/server/services/whatsapp/cloud-api'
import { ErroDoWhatsapp, type Conexao, type ModeloDaMeta } from '~~/server/services/whatsapp/provider'
import { registrarEventos } from '~~/server/utils/lead-crm'
import { respostaPatch } from '~~/server/utils/whatsapp-inbox'

type Client = SupabaseClient<Database>

/**
 * O que os endpoints de envio têm em comum: achar a conexão, traduzir o erro
 * da Meta para uma frase, e gravar a mensagem que saiu.
 */

export interface ConexaoAtiva {
  conta: WhatsappAccountRecord
  conexao: Conexao
}

function paraConexao(conta: WhatsappAccountRecord | null): ConexaoAtiva {
  if (!conta?.ativo || !conta.accessTokenEnc) {
    throw createError({ statusCode: 409, statusMessage: 'O número do WhatsApp está desconectado. Conecte em Conversas.' })
  }
  return {
    conta,
    conexao: { phoneNumberId: conta.phoneNumberId, wabaId: conta.wabaId, accessToken: decifrar(conta.accessTokenEnc) },
  }
}

/** O número ativo da imobiliária. */
export async function conexaoDoTenant(service: Client, tenantId: string): Promise<ConexaoAtiva> {
  return paraConexao(await getActiveAccount(service, tenantId))
}

/** O número de uma conversa — pode não ser o ativo, se a imobiliária trocou de número. */
export async function conexaoDaConversa(service: Client, tenantId: string, accountId: string): Promise<ConexaoAtiva> {
  return paraConexao(await getAccountById(service, tenantId, accountId))
}

/** Erro da Meta em frase para a tela. Qualquer outro erro sobe como está. */
export function erroDoEnvio(e: unknown, tenantSlug: string): never {
  if (e instanceof ErroDoWhatsapp) {
    logWarn('whatsapp.envio_recusado', { tenant: tenantSlug, credencial: e.credencialInvalida, janela: e.foraDaJanela })
    throw createError({
      statusCode: e.foraDaJanela ? 422 : 502,
      statusMessage: e.foraDaJanela
        ? 'Passaram 24h desde a última mensagem do cliente. Só dá para retomar com um modelo aprovado.'
        : e.credencialInvalida
          ? 'A Meta recusou o token do número. Reconecte o WhatsApp em Conversas.'
          : `O WhatsApp não aceitou a mensagem: ${e.message}`,
    })
  }
  throw e
}

/**
 * O modelo, relido NA META, pronto para enviar.
 *
 * Nunca o corpo que o navegador mandou: o texto gravado no histórico é o que o
 * cliente leu, e aceitar o corpo do body deixaria o histórico dizer qualquer
 * coisa. Relido a cada envio porque a Meta pausa e recusa modelo sem avisar —
 * o aprovado de ontem pode não sair hoje.
 */
export async function modeloParaEnviar(conexao: Conexao, input: WhatsappTemplateSendInput, tenantSlug: string): Promise<{ modelo: ModeloDaMeta; texto: string }> {
  let modelos: ModeloDaMeta[]
  try {
    modelos = await cloudApi().listarModelos(conexao)
  } catch (e) {
    erroDoEnvio(e, tenantSlug)
  }
  const modelo = modelos.find((m) => m.name === input.name && m.language === input.language)
  if (!modelo || modelo.status !== 'aprovado') {
    throw createError({ statusCode: 422, statusMessage: 'Este modelo não está aprovado pela Meta. Escolha outro ou aguarde a análise.' })
  }
  if (!modelo.suportado) {
    throw createError({ statusCode: 422, statusMessage: 'Este modelo tem imagem ou link variável, e o painel ainda não envia esse tipo.' })
  }
  if (input.values.length !== modelo.variables.length) {
    throw createError({ statusCode: 422, statusMessage: 'Preencha todos os campos do modelo.' })
  }
  for (const v of input.values) {
    const problema = problemaNoValor(v)
    if (problema) throw createError({ statusCode: 422, statusMessage: problema })
  }
  return { modelo, texto: preencherModelo(modelo.body, modelo.variables, input.values) }
}

/**
 * Grava a mensagem que a Meta CONFIRMOU e atualiza a conversa. Só depois do
 * `wamid`: ver `messages.post.ts`.
 */
export async function registrarSaida(
  service: Client,
  tenant: { id: string; slug: string },
  userId: string,
  state: Pick<ConversationState, 'id' | 'leadId' | 'firstResponseAt' | 'lastInboundAt'>,
  msg: {
    wamid: string
    type: string
    body: string | null
    modelo?: string
    media?: { id: null; mime: string; filename: string | null; path: string; size?: number }
  },
): Promise<void> {
  const quando = new Date().toISOString()
  await insertMessage(service, tenant.id, {
    conversationId: state.id,
    wamid: msg.wamid,
    direction: 'out',
    origin: 'painel',
    type: msg.type,
    body: msg.body,
    status: 'enviada',
    sentBy: userId,
    occurredAt: quando,
    media: msg.media ?? null,
  })
  await updateConversation(service, tenant.id, state.id, respostaPatch(state, quando, previa(msg.type, msg.body)))
  // Modelo entra na linha do tempo do contato; texto na janela não — a
  // conversa inteira já está na tela de Conversas, e repetir cada mensagem no
  // histórico o afogaria.
  if (msg.modelo && state.leadId) {
    await registrarEventos(service, tenant, state.leadId, [{ kind: 'whatsapp', body: `Modelo "${msg.modelo}" enviado pelo WhatsApp`, meta: {} }], userId)
  }
}
