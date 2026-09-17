import { removeContractParty } from '~~/server/repositories/contract.repository'

/** Desfaz o vínculo de uma pessoa com o contrato. */
export default defineEventHandler(async (event) => {
  const { client, tenant } = await requireTenantMember(event)
  const contractId = idDeRota(getRouterParam(event, 'id'), 'ID do contrato')
  const parteId = idDeRota(getRouterParam(event, 'parteId'), 'ID da parte')

  await removeContractParty(client, tenant.id, contractId, parteId)
  return { ok: true }
})
