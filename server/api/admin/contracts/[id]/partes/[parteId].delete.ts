import { removeContractParty } from '~~/server/repositories/contract.repository'

/** Desfaz o vínculo de uma pessoa com o contrato. */
export default defineEventHandler(async (event) => {
  const { client, tenant } = await requireTenantMember(event)
  const contractId = getRouterParam(event, 'id')
  const parteId = getRouterParam(event, 'parteId')
  if (!contractId || !parteId) {
    throw createError({ statusCode: 400, statusMessage: 'ID inválido.' })
  }

  await removeContractParty(client, tenant.id, contractId, parteId)
  return { ok: true }
})
