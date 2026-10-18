import { disconnectAccount } from '~~/server/repositories/whatsapp.repository'

/** Desconecta: apaga o token. O histórico continua no painel. */
export default defineEventHandler(async (event) => {
  const { tenant, membership } = await requireTenantMember(event)
  await exigirWhatsapp(tenant.id)
  if (membership.role !== 'owner') {
    throw createError({ statusCode: 403, statusMessage: 'Só o responsável pela conta da imobiliária pode desconectar o WhatsApp.' })
  }
  await disconnectAccount(serviceSupabase(), tenant.id)
  return { ok: true }
})
