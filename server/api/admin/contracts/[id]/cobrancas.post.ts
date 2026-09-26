import type { ChargeCreateInput } from '~~/shared/models/cobranca'
import { competenciaForaDaVigencia, competenciaParaData, somar } from '~~/shared/models/cobranca'
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
  await exigirCobranca(tenant.id)
  const id = idDeRota(getRouterParam(event, 'id'))
  const body = await readBody<ChargeCreateInput>(event)
  assertChargeCreateInput(body)

  const contrato = await getContract(client, tenant.id, id)
  if (!contrato) throw createError({ statusCode: 404, statusMessage: 'Contrato não encontrado.' })
  if (contrato.status !== 'ativo') {
    throw createError({ statusCode: 422, statusMessage: 'Contrato encerrado não gera cobrança nova.' })
  }
  const kind = body.kind ?? 'mensal'
  // Aluguel é do mês de ocupação: antes do início o inquilino ainda não morava
  // lá, depois do fim já saiu. Avulsa (multa de rescisão, reparo) pode cair
  // depois do fim, e por isso fica de fora.
  const fora = kind === 'mensal' ? competenciaForaDaVigencia(body.competence, contrato) : null
  if (fora) {
    throw createError({
      statusCode: 422,
      statusMessage:
        fora === 'antes'
          ? 'Este mês é anterior ao início do contrato: o inquilino ainda não morava no imóvel.'
          : 'Este mês é posterior ao fim do contrato.',
    })
  }
  const aluguel = body.rentAmount ?? contrato.rentAmount
  if (kind === 'mensal' && !aluguel) {
    throw createError({ statusCode: 422, statusMessage: 'Informe o valor do aluguel no contrato antes de gerar a cobrança.' })
  }

  const items = [
    ...(kind === 'mensal' && aluguel ? [{ kind: 'aluguel' as const, description: null, amount: aluguel }] : []),
    ...(body.extras ?? []).map((x) => ({ kind: x.kind, description: x.description?.trim() || null, amount: x.amount })),
  ]
  if (!items.length) throw createError({ statusCode: 422, statusMessage: 'Lance ao menos um item.' })
  // A emissão já recusava total ≤ 0, mas o rascunho era salvo: um desconto de
  // R$ 2.000 num aluguel de R$ 1.300 virou rascunho de −R$ 700, que ninguém
  // consegue emitir nem receber. Recusar aqui diz o problema enquanto a pessoa
  // ainda está com o formulário aberto.
  const total = somar(items.map((x) => x.amount))
  if (total <= 0) {
    throw createError({
      statusCode: 422,
      statusMessage: `O total ficaria em ${total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}. O desconto não pode ser maior que o aluguel e os outros itens.`,
    })
  }

  const chargeId = await createChargeDraft(
    serviceSupabase(),
    tenant.id,
    contrato.id,
    { kind, competence: competenciaParaData(body.competence), dueOn: body.dueOn, items },
    user.id,
  )
  return getCharge(client, tenant.id, chargeId)
})
