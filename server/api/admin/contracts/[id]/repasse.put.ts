import type { PayoutDestinationInput } from '~~/shared/models/lease'
import { listContractParties } from '~~/server/repositories/contract.repository'
import { replacePayoutDestination } from '~~/server/repositories/payout-destination.repository'

/**
 * Pix ou conta do PROPRIETÁRIO deste contrato, para o repasse.
 *
 * O dono do destino sai das partes do contrato (lidas com o tenant no filtro),
 * nunca do body: um `portalUserId` aceito do navegador deixaria gravar dado
 * bancário no cadastro de qualquer pessoa.
 */
export default defineEventHandler(async (event) => {
  const { client, tenant, user } = await requireTenantMember(event)
  await exigirCobranca(tenant.id)
  const id = idDeRota(getRouterParam(event, 'id'))
  const body = await readBody<PayoutDestinationInput>(event)
  // A mesma validação do destino usada no assistente.
  assertRepasseInput(body)

  const dono = (await listContractParties(client, tenant.id, id)).find((p) => p.role === 'proprietario')
  if (!dono) throw createError({ statusCode: 422, statusMessage: 'Vincule o proprietário ao contrato antes de informar o repasse.' })
  // Service_role: escrita financeira revogada do membro na 0042.
  await replacePayoutDestination(serviceSupabase(), tenant.id, dono.portalUserId, body, user.id)
  return { ok: true }
})
