import type { WhatsappClickInput } from '~~/shared/models/whatsapp-click'
import { toWhatsappClickOrigin } from '~~/shared/models/whatsapp-click'
import { whatsappTargetForCode } from '~~/server/repositories/property.repository'
import { recordWhatsappClick } from '~~/server/repositories/whatsapp-click.repository'

/**
 * Registra um clique no botão de WhatsApp do site. Quem chama é o
 * `sendBeacon` de `app/plugins/observabilidade.client.ts`.
 *
 * Responde 204 em TODOS os casos, inclusive erro. O beacon não lê resposta, e
 * nada que o visitante faça depende dela; uma resposta que variasse com o
 * código do imóvel serviria para sondar quais códigos existem.
 *
 * O tenant vem do host, como no formulário de lead; o destino (corretor ou
 * imobiliária) é calculado aqui. Vindo do body, seria o visitante escrevendo
 * a métrica que o painel mostra ao cliente.
 */
export default defineEventHandler(async (event) => {
  setResponseStatus(event, 204)

  // Domínio-raiz da plataforma (landing da Moradi) também tem botão de
  // WhatsApp — o da própria Moradi. Não é clique de imobiliária nenhuma.
  const tenant = event.context.tenant
  if (!tenant) return null

  try {
    const body = await readBody<WhatsappClickInput>(event).catch(() => null)
    const code = typeof body?.propertyCode === 'string' ? body.propertyCode.trim().slice(0, 40) : ''

    // Código que não resolve (imóvel despublicado, digitado errado) ainda é um
    // clique para a imobiliária: grava sem imóvel.
    const alvo = code ? await whatsappTargetForCode(serviceSupabase(), tenant.id, code) : null

    await recordWhatsappClick(serviceSupabase(), {
      tenantId: tenant.id,
      propertyId: alvo?.propertyId ?? null,
      brokerId: alvo?.brokerId ?? null,
      origin: toWhatsappClickOrigin(body?.origin),
      ipHash: requestIpHash(event),
    })
  } catch (e) {
    // Sem código de imóvel nem IP no log: é rastro do visitante.
    logError('whatsapp_click.falhou', { tenant: tenant.slug, reason: errMessage(e) })
  }
  return null
})
