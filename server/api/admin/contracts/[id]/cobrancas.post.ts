import type { ChargeCreateInput } from '~~/shared/models/cobranca'
import { competenciaParaData } from '~~/shared/models/cobranca'
import { getContract } from '~~/server/repositories/contract.repository'
import { createChargeDraft, getCharge } from '~~/server/repositories/cobranca.repository'

/**
 * Gera o RASCUNHO da cobrança do mês: aluguel do contrato (ou o informado)
 * mais os itens lançados à mão. Nada sai para o provedor aqui — emitir é
 * outro clique, depois de a imobiliária conferir o total.
 *
 * O contrato é lido com o client do membro e o tenant da sessão: é essa
 * leitura que prova que o id da URL é desta imobiliária, antes da escrita
 * pela service_role.
 */
export default defineEventHandler(async (event) => {
  const { client, tenant, user } = await requireTenantMember(event)
  const id = idDeRota(getRouterParam(event, 'id'))
  const body = await readBody<ChargeCreateInput>(event)
  assertChargeCreateInput(body)

  const contrato = await getContract(client, tenant.id, id)
  if (!contrato) throw createError({ statusCode: 404, statusMessage: 'Contrato não encontrado.' })
  if (contrato.status !== 'ativo') {
    throw createError({ statusCode: 422, statusMessage: 'Contrato encerrado não gera cobrança nova.' })
  }
  const aluguel = body.rentAmount ?? contrato.rentAmount
  const kind = body.kind ?? 'mensal'
  if (kind === 'mensal' && !aluguel) {
    throw createError({ statusCode: 422, statusMessage: 'Informe o valor do aluguel no contrato antes de gerar a cobrança.' })
  }

  const items = [
    ...(kind === 'mensal' && aluguel ? [{ kind: 'aluguel' as const, description: null, amount: aluguel }] : []),
    ...(body.extras ?? []).map((x) => ({ kind: x.kind, description: x.description?.trim() || null, amount: x.amount })),
  ]
  if (!items.length) throw createError({ statusCode: 422, statusMessage: 'Lance ao menos um item.' })

  const chargeId = await createChargeDraft(
    serviceSupabase(),
    tenant.id,
    contrato.id,
    { kind, competence: competenciaParaData(body.competence), dueOn: body.dueOn, items },
    user.id,
  )
  return getCharge(client, tenant.id, chargeId)
})
