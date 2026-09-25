import { deleteChargeDraft, getCharge } from '~~/server/repositories/cobranca.repository'

/**
 * Apaga um RASCUNHO. Cobrança que chegou a ser emitida não se apaga: o boleto
 * existiu, alguém pode tê-lo na mão, e o rastro dele é o que explica um
 * pagamento que chegue depois. Essa se cancela.
 */
export default defineEventHandler(async (event) => {
  const { client, tenant } = await requireTenantMember(event)
  const id = idDeRota(getRouterParam(event, 'id'))
  const charge = await getCharge(client, tenant.id, id)
  if (!charge) throw createError({ statusCode: 404, statusMessage: 'Cobrança não encontrada.' })
  if (charge.status !== 'rascunho') {
    throw createError({ statusCode: 422, statusMessage: 'Só rascunho pode ser apagado. Cancele a cobrança emitida.' })
  }
  if (!(await deleteChargeDraft(serviceSupabase(), tenant.id, id))) {
    throw createError({ statusCode: 409, statusMessage: 'A cobrança acabou de ser emitida em outra aba.' })
  }
  return { ok: true }
})
