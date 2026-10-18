import { rotateLeadsToken } from '~~/server/repositories/portal-feed.repository'

/**
 * Gera um link de leads novo — o antigo para na hora. Para quando o link
 * vazou (um print, um ex-funcionário): quem o tem cria contato no funil e,
 * com o automático ligado, dispara WhatsApp pelo número da imobiliária.
 * Só o owner.
 */
export default defineEventHandler(async (event) => {
  const { tenant, membership } = await requireTenantMember(event)
  if (!(await crmAtivo(tenant.id))) throw createError({ statusCode: 404, statusMessage: 'Recurso não ativo.' })
  if (membership.role !== 'owner') {
    throw createError({ statusCode: 403, statusMessage: 'Só o responsável pela conta da imobiliária pode gerar um link novo.' })
  }
  await rotateLeadsToken(serviceSupabase(), tenant.id)
  logWarn('portal_lead.token_trocado', { tenant: tenant.slug })
  return { ok: true }
})
