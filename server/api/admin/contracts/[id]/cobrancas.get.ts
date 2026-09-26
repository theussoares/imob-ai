import { getContract } from '~~/server/repositories/contract.repository'
import { getPaymentAccount, listCharges, listPayouts } from '~~/server/repositories/cobranca.repository'
import { toPaymentAccountView } from '~~/server/mappers/cobranca.mapper'

/**
 * Cobranças e repasses de um contrato, com o estado derivado (0041: nunca
 * gravado) e a conta de cobrança — a tela precisa saber se "Emitir" é
 * possível e se "Simular pagamento" aparece.
 */
export default defineEventHandler(async (event) => {
  const { client, tenant } = await requireTenantMember(event)
  const id = idDeRota(getRouterParam(event, 'id'))
  const contrato = await getContract(client, tenant.id, id)
  if (!contrato) throw createError({ statusCode: 404, statusMessage: 'Contrato não encontrado.' })
  const [cobrancas, repasses, conta] = await Promise.all([
    listCharges(client, tenant.id, id),
    listPayouts(client, tenant.id, id),
    getPaymentAccount(serviceSupabase(), tenant.id),
  ])
  return { cobrancas, repasses, conta: conta ? toPaymentAccountView(conta) : null }
})
