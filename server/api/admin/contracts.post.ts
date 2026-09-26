import type { ContractInput } from '~~/shared/models/portal'
import { createContract } from '~~/server/repositories/contract.repository'
import { getPropertyById } from '~~/server/repositories/property.repository'

/** Cria um contrato. */
export default defineEventHandler(async (event) => {
  const { client, tenant } = await requireTenantMember(event)
  const body = await readBody<ContractInput>(event)
  assertContractInput(body)
  // Mesmo furo do PUT: FK simples em `property_id` aceita imóvel de outro tenant.
  // Service_role também pelo mesmo motivo do PUT (0031).
  if (body.propertyId && !(await getPropertyById(serviceSupabase(), tenant.id, body.propertyId))) {
    throw createError({ statusCode: 422, statusMessage: 'Imóvel não encontrado.' })
  }
  return createContract(client, tenant.id, body)
})
