import { markPayoutPaid } from '~~/server/repositories/cobranca.repository'

/**
 * Marca o repasse como feito. Na v1 a transferência ao proprietário sai do
 * banco da imobiliária, à mão (spec B3.8); o split automático do provedor é
 * item da seção 7.
 */
export default defineEventHandler(async (event) => {
  const { tenant } = await requireTenantMember(event)
  const id = idDeRota(getRouterParam(event, 'id'))
  // Service_role com o tenant da sessão no filtro: a 0042 revogou o update
  // do membro, e o `eq('tenant_id')` é o que prende o id da URL a esta
  // imobiliária.
  if (!(await markPayoutPaid(serviceSupabase(), tenant.id, id))) {
    throw createError({ statusCode: 404, statusMessage: 'Repasse não encontrado ou já marcado.' })
  }
  return { ok: true }
})
