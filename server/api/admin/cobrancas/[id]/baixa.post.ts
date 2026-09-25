import type { ManualSettlementInput } from '~~/shared/models/cobranca'

/** Registra pagamento recebido por fora (Pix direto, dinheiro). Regras em `baixarManualmente`. */
export default defineEventHandler(async (event) => {
  const { client, tenant, user } = await requireTenantMember(event)
  const id = idDeRota(getRouterParam(event, 'id'))
  const body = await readBody<ManualSettlementInput>(event)
  assertManualSettlementInput(body)
  return baixarManualmente(client, tenant, id, body, user.id)
})
