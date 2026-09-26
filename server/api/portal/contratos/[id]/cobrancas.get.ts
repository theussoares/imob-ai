import { getContractForClient } from '~~/server/repositories/contract.repository'
import { listChargesForTenantAsClient } from '~~/server/repositories/cobranca.repository'
import type { ChargeForClient } from '~~/shared/models/cobranca'
import { ehUuid } from '~~/shared/utils/uuid'

/**
 * Os boletos do INQUILINO neste contrato (spec B4).
 *
 * A 0041 não deu policy de portal às tabelas financeiras, e isso continua: a
 * leitura aqui é pela service_role, DEPOIS de provar com o client do próprio
 * cliente (RLS ligada) que o contrato é dele e que ele é o inquilino. O que
 * sai é o recorte `paraCliente` — sem itens, sem liquidações, sem provedor.
 *
 * Proprietário e fiador recebem lista vazia: o boleto é do inquilino, e o
 * fiador só deveria ver dívida quando for acionado, o que é outra conversa.
 */
export default defineEventHandler(async (event): Promise<ChargeForClient[]> => {
  const { client, tenant, portalUserId } = await requirePortalUser(event)
  const id = getRouterParam(event, 'id') || ''
  if (!ehUuid(id)) throw createError({ statusCode: 404, statusMessage: 'Contrato não encontrado.' })

  const contrato = await getContractForClient(client, tenant.id, portalUserId, id)
  if (!contrato) throw createError({ statusCode: 404, statusMessage: 'Contrato não encontrado.' })
  if (!contrato.roles.includes('inquilino')) return []
  // Sem o recurso (0055), a Área do Cliente fica como antes da cobrança: sem a
  // seção de boletos. Lista vazia, e não erro, porque a tela só esconde.
  if (!(await cobrancaAtiva(tenant.id))) return []

  return listChargesForTenantAsClient(serviceSupabase(), tenant.id, contrato.id)
})
