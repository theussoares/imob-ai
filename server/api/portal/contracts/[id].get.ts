import { getContractForClient } from '~~/server/repositories/contract.repository'

/**
 * Um contrato do cliente logado.
 *
 * Contrato de outra pessoa e contrato inexistente respondem EXATAMENTE a mesma
 * coisa: 404 com a mesma mensagem. Distinguir os dois (403 para alheio, 404 para
 * inexistente) entrega ao curioso um oráculo de quais ids existem no banco.
 *
 * A recusa já acontece em duas camadas antes desta: a consulta é escopada pelo
 * `portalUserId` e a RLS filtra por `auth.uid()`. O `if` abaixo é o terceiro
 * anel, não o único.
 */
export default defineEventHandler(async (event) => {
  const { client, portalUserId } = await requirePortalUser(event)

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Contrato inválido.' })

  const contract = await getContractForClient(client, portalUserId, id)
  if (!contract) throw createError({ statusCode: 404, statusMessage: 'Contrato não encontrado.' })

  return contract
})
