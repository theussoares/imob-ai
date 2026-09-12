import type { ContractPartyInput } from '~~/shared/models/portal'
import { addContractParty } from '~~/server/repositories/contract.repository'

/**
 * Vincula uma pessoa já cadastrada ao contrato, com papel.
 *
 * Vincular é conceder acesso: a partir daqui, esta pessoa passa a ver este
 * contrato e os documentos endereçados ao papel dela. Por isso o repositório
 * confere DUAS coisas antes de gravar — que o contrato é desta imobiliária e que
 * a pessoa também é. O insert em `contract_parties` sozinho olharia só para o
 * contrato.
 */
export default defineEventHandler(async (event) => {
  const { client, tenant } = await requireTenantMember(event)
  const contractId = getRouterParam(event, 'id')
  if (!contractId) throw createError({ statusCode: 400, statusMessage: 'ID inválido.' })

  const body = await readBody<ContractPartyInput>(event)
  assertContractPartyInput(body)

  return addContractParty(client, tenant.id, contractId, body)
})
