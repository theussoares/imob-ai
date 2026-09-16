import type { ContractInput, ContractInternalInput } from '~~/shared/models/portal'
import { updateContract, upsertContractInternal } from '~~/server/repositories/contract.repository'

/** Atualiza um contrato, e os campos internos junto quando vierem. */
export default defineEventHandler(async (event) => {
  const { client, tenant } = await requireTenantMember(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'ID inválido.' })

  const body = await readBody<ContractInput & { internal?: ContractInternalInput }>(event)
  assertContractInput(body)
  if (body.internal) assertContractInternalInput(body.internal)

  const contrato = await updateContract(client, tenant.id, id, body)

  // Só grava os internos quando vieram no payload: um PUT sem eles é edição da
  // ficha do contrato, e não um pedido de apagar a anotação da imobiliária.
  if (body.internal) await upsertContractInternal(client, id, body.internal)

  return contrato
})
