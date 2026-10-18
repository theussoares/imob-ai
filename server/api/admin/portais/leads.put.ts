import { getOrCreateLeadsToken, setLeadsAutoWhatsapp } from '~~/server/repositories/portal-feed.repository'

/**
 * Liga ou desliga o primeiro WhatsApp automático para o lead de portal.
 *
 * Só o owner: a mensagem sai em nome da imobiliária, para uma pessoa que
 * ninguém da equipe viu ainda, e cada envio é cobrado pela Meta na conta dela.
 */
export default defineEventHandler(async (event) => {
  const { tenant, membership } = await requireTenantMember(event)
  if (!(await crmAtivo(tenant.id))) throw createError({ statusCode: 404, statusMessage: 'Recurso não ativo.' })
  if (membership.role !== 'owner') {
    throw createError({ statusCode: 403, statusMessage: 'Só o responsável pela conta da imobiliária pode mudar isto.' })
  }
  const body = await readBody<{ autoWhatsapp?: unknown }>(event)
  if (typeof body?.autoWhatsapp !== 'boolean') throw createError({ statusCode: 422, statusMessage: 'Valor inválido.' })
  if (body.autoWhatsapp && !(await whatsappAtivo(tenant.id))) {
    throw createError({ statusCode: 422, statusMessage: 'Conversas do WhatsApp não estão ativas para esta imobiliária.' })
  }
  const service = serviceSupabase()
  await getOrCreateLeadsToken(service, tenant.id)
  await setLeadsAutoWhatsapp(service, tenant.id, body.autoWhatsapp)
  return { ok: true }
})
