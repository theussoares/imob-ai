import type { ContractInput, ContractInternalInput } from '~~/shared/models/portal'
import { updateContract, upsertContractInternal } from '~~/server/repositories/contract.repository'
import { getPropertyById } from '~~/server/repositories/property.repository'

/** Atualiza um contrato, e os campos internos junto quando vierem. */
export default defineEventHandler(async (event) => {
  const { client, tenant } = await requireTenantMember(event)
  const id = idDeRota(getRouterParam(event, 'id'))

  const body = await readBody<ContractInput & { internal?: ContractInternalInput }>(event)
  assertContractInput(body)
  if (body.internal) assertContractInternalInput(body.internal)

  assertCaucaoDentroDoLimite(body.guaranteeType, body.internal?.guaranteeAmount, body.rentAmount)
  // `contracts.property_id` tem FK simples: sem esta leitura com o tenant no
  // filtro, o banco aceitaria o imóvel de outra imobiliária.
  if (body.propertyId && !(await getPropertyById(client, tenant.id, body.propertyId))) {
    throw createError({ statusCode: 422, statusMessage: 'Imóvel não encontrado.' })
  }

  const contrato = await updateContract(client, tenant.id, id, body)

  // Só grava os internos quando vieram no payload: um PUT sem eles é edição da
  // ficha do contrato, e não um pedido de apagar a anotação da imobiliária.
  if (body.internal) await upsertContractInternal(client, id, body.internal)

  return contrato
})
