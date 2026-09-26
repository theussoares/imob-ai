import { getCharge } from '~~/server/repositories/cobranca.repository'

/**
 * "Consultar no Asaas": traz o estado que a cobrança tem no provedor.
 * O porquê está em `sincronizarComProvedor`.
 *
 * A cobrança é lida primeiro com o client do MEMBRO e o tenant da sessão: é
 * isso que prova que o id da URL é desta imobiliária, antes de a service_role
 * entrar para processar o evento.
 */
export default defineEventHandler(async (event) => {
  const { client, tenant } = await requireTenantMember(event)
  const id = idDeRota(getRouterParam(event, 'id'))
  const charge = await getCharge(client, tenant.id, id)
  if (!charge) throw createError({ statusCode: 404, statusMessage: 'Cobrança não encontrada.' })
  return sincronizarComProvedor(serviceSupabase(), tenant.id, charge.id)
})
