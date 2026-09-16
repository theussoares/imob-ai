import { CONTRACT_PARTY_ROLES, type ContractPartyRole } from '~~/shared/models/portal'
import { addContractParty } from '~~/server/repositories/contract.repository'

/** Vincula uma pessoa ao contrato, com papel. */
export default defineEventHandler(async (event) => {
  const { client, tenant } = await requireTenantMember(event)
  const contractId = getRouterParam(event, 'id')
  if (!contractId) throw createError({ statusCode: 400, statusMessage: 'ID inválido.' })

  const body = await readBody<{ portalUserId?: string; role?: string }>(event)
  const portalUserId = String(body?.portalUserId || '').trim()
  if (!portalUserId) throw createError({ statusCode: 422, statusMessage: 'Escolha o cliente.' })

  const role = String(body?.role || '') as ContractPartyRole
  if (!CONTRACT_PARTY_ROLES.includes(role)) {
    throw createError({ statusCode: 422, statusMessage: 'Papel inválido.' })
  }

  await addContractParty(client, tenant.id, contractId, portalUserId, role)
  return { ok: true }
})
