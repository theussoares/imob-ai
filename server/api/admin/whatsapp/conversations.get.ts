import { toWhatsappFiltro } from '~~/shared/models/whatsapp'
import { listConversations } from '~~/server/repositories/whatsapp.repository'
import { ehUuid } from '~~/shared/utils/uuid'

/** Caixa de entrada. Client do membro: a RLS é a segunda trava. */
export default defineEventHandler(async (event) => {
  const { client, tenant } = await requireTenantMember(event)
  await exigirWhatsapp(tenant.id)
  const q = getQuery(event)
  const corretor = typeof q.corretor === 'string' && ehUuid(q.corretor) ? q.corretor : null
  return listConversations(client, tenant.id, toWhatsappFiltro(q.filtro), corretor)
})
