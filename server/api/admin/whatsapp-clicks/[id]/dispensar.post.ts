import { dismissClick } from '~~/server/repositories/whatsapp-click.repository'

/** Dispensa um clique no WhatsApp sem virar contato (MELHORIA 11). */
export default defineEventHandler(async (event) => {
  const { client, tenant, user } = await requireTenantMember(event)
  const id = idDeRota(getRouterParam(event, 'id'))
  const ok = await dismissClick(client, tenant.id, id, user.id)
  if (!ok) throw createError({ statusCode: 409, statusMessage: 'Este clique já virou contato ou já foi dispensado.' })
  return { ok: true }
})
