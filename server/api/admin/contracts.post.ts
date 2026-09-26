import type { ContractInput } from '~~/shared/models/portal'
import { createContract } from '~~/server/repositories/contract.repository'

/** Cria um contrato. */
export default defineEventHandler(async (event) => {
  const { client, tenant } = await requireTenantMember(event)
  const body = await readBody<ContractInput>(event)
  assertContractInput(body)
  return createContract(client, tenant.id, body)
})
