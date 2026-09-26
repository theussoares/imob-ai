import type { ContractInput, ContractInternalInput } from '~~/shared/models/portal'
import { assertImovelLivreNoPeriodo, updateContract, upsertContractInternal } from '~~/server/repositories/contract.repository'
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
  // filtro, o banco aceitaria o imóvel de outra imobiliária. Service_role pelo
  // mesmo motivo de `properties/[id].get.ts` (0031): com o client do membro o
  // `select('*')` volta 403 e o PUT vira 500.
  if (body.propertyId && !(await getPropertyById(serviceSupabase(), tenant.id, body.propertyId))) {
    throw createError({ statusCode: 422, statusMessage: 'Imóvel não encontrado.' })
  }

  // Reativar um contrato encerrado, trocar o imóvel ou esticar as datas também
  // podem pôr dois contratos ativos no mesmo imóvel — não só criar.
  if ((body.status ?? 'ativo') === 'ativo') {
    await assertImovelLivreNoPeriodo(client, tenant.id, { ...body, excetoId: id })
  }

  const contrato = await updateContract(client, tenant.id, id, body)

  // Só grava os internos quando vieram no payload: um PUT sem eles é edição da
  // ficha do contrato, e não um pedido de apagar a anotação da imobiliária.
  if (body.internal) await upsertContractInternal(client, id, body.internal)

  return contrato
})
