import { listRecentWhatsappClicks } from '~~/server/repositories/whatsapp-click.repository'

/** Cliques no WhatsApp dos últimos 7 dias, para a página de contatos. */
export default defineEventHandler(async (event) => {
  const { client, tenant } = await requireTenantMember(event)
  const desde = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  return listRecentWhatsappClicks(client, tenant.id, desde)
})
