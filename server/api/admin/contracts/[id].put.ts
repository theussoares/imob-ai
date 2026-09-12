import type { ContractSavePayload } from '~~/shared/models/portal'
import { updateContract, upsertContractInternal } from '~~/server/repositories/contract.repository'

/**
 * Atualiza um contrato — inclusive para encerrá-lo (`status: 'encerrado'`).
 *
 * Não existe DELETE de contrato, e a ausência é a decisão: encerrar preserva o
 * histórico que o ex-inquilino ainda precisa (recibos do imposto de renda), e a
 * 0028 mantém o contrato encerrado legível para quem é parte dele.
 *
 * Os dois filtros dentro de `updateContract` (`tenant_id` e `id`) são a barreira
 * de escopo; a RLS `contracts_member_write` é a segunda.
 */
export default defineEventHandler(async (event) => {
  const { client, tenant } = await requireTenantMember(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'ID inválido.' })

  const body = await readBody<ContractSavePayload>(event)
  assertContractInput(body)

  const contract = await updateContract(client, tenant.id, id, body)
  if (body.internal) {
    await upsertContractInternal(client, tenant.id, id, body.internal)
  }
  return contract
})
