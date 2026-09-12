import { removeContractParty } from '~~/server/repositories/contract.repository'

/**
 * Tira uma pessoa do contrato.
 *
 * Apaga o VÍNCULO, não o cliente: a pessoa continua cadastrada, com os outros
 * contratos dela e com a trilha de download preservada — que é o que responde
 * "quem acessou meu contrato?" depois que alguém sai.
 */
export default defineEventHandler(async (event) => {
  const { client, tenant } = await requireTenantMember(event)
  const contractId = getRouterParam(event, 'id')
  const partyId = getRouterParam(event, 'partyId')
  if (!contractId || !partyId) {
    throw createError({ statusCode: 400, statusMessage: 'ID inválido.' })
  }

  await removeContractParty(client, tenant.id, contractId, partyId)
  return { ok: true }
})
