import type { LeaseCreateInput } from '~~/shared/models/lease'
import { criarLocacao } from '~~/server/utils/locacao'

/**
 * Cria a locação inteira a partir do assistente de 4 etapas (spec 25/09, 4B):
 * pessoas novas, contrato, campos internos, partes, repasse e imóvel alugado.
 */
export default defineEventHandler(async (event) => {
  const { client, tenant, user } = await requireTenantMember(event)
  const body = await readBody<LeaseCreateInput>(event)
  assertLeaseCreateInput(body)
  return criarLocacao(client, tenant, body, user.id)
})
