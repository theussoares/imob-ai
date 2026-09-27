import { dismissClick } from '~~/server/repositories/whatsapp-click.repository'

/**
 * Dispensa um clique no WhatsApp sem virar contato (MELHORIA 11).
 *
 * Service role porque a 0057 não abre `dismissed_*` ao membro: se abrisse, ele
 * gravaria qualquer autor direto pela API do Supabase. O tenant da sessão vai
 * no where (`dismissClick`), e o autor sai da sessão, nunca do body.
 */
export default defineEventHandler(async (event) => {
  const { tenant, user } = await requireTenantMember(event)
  const id = idDeRota(getRouterParam(event, 'id'))
  const ok = await dismissClick(serviceSupabase(), tenant.id, id, user.id)
  if (!ok) throw createError({ statusCode: 409, statusMessage: 'Este clique já virou contato ou já foi dispensado.' })
  return { ok: true }
})
