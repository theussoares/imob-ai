import { getOrCreateLeadsToken } from '~~/server/repositories/portal-feed.repository'

/**
 * A URL que a imobiliária cola no Canal Pro para receber os leads, e se o
 * primeiro WhatsApp automático está ligado.
 *
 * Qualquer host do painel serve: o webhook descobre o tenant pelo token, não
 * pelo domínio. Sempre https — o Canal Pro não segue redirect de POST.
 */
export default defineEventHandler(async (event) => {
  const { tenant } = await requireTenantMember(event)
  if (!(await crmAtivo(tenant.id))) throw createError({ statusCode: 404, statusMessage: 'Recurso não ativo.' })
  const cfg = await getOrCreateLeadsToken(serviceSupabase(), tenant.id)
  const host = getRequestURL(event, { xForwardedHost: true }).host
  return {
    url: `https://${host}/api/webhooks/portais/leads/${cfg.token}`,
    autoWhatsapp: cfg.autoWhatsapp,
    whatsappDisponivel: await whatsappAtivo(tenant.id),
  }
})
