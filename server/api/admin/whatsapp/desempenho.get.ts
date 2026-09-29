import type { Desempenho } from '~~/shared/models/whatsapp'
import { resumoDeDesempenho, toDesempenhoPeriodo } from '~~/shared/models/whatsapp'
import { listConversationsForMetrics, listWaitingConversations } from '~~/server/repositories/whatsapp.repository'

/** Painel de desempenho: tempo de primeira resposta e quem está esperando. */
export default defineEventHandler(async (event): Promise<Desempenho> => {
  const { client, tenant } = await requireTenantMember(event)
  await exigirWhatsapp(tenant.id)
  const dias = toDesempenhoPeriodo(getQuery(event).dias)
  const agora = new Date()
  const desde = new Date(agora.getTime() - dias * 24 * 60 * 60 * 1000).toISOString()
  const [conversas, esperando] = await Promise.all([
    listConversationsForMetrics(client, tenant.id, desde),
    listWaitingConversations(client, tenant.id),
  ])
  return resumoDeDesempenho(dias, conversas, esperando, agora)
})
