import {
  getContractForClient,
  rolesInContract,
} from '~~/server/repositories/contract.repository'
import { listDocumentsForClient } from '~~/server/repositories/portal-document.repository'

/**
 * Documentos de um contrato, na visão do cliente.
 *
 * A ordem das três chamadas é a regra de permissão, e não é intercambiável:
 *
 *   1. o contrato é desta pessoa?   (senão 404, o mesmo de inexistente)
 *   2. quais papéis ela tem NELE?   (é o papel que define a audiência)
 *   3. quais documentos esses papéis alcançam?
 *
 * Pular o passo 2 e filtrar por "papéis da pessoa em qualquer contrato" deixaria
 * um proprietário ver o recibo de um contrato em que ele é inquilino — papel é
 * atributo do vínculo, nunca da pessoa.
 */
export default defineEventHandler(async (event) => {
  const { client, portalUserId } = await requirePortalUser(event)

  const contractId = getRouterParam(event, 'id')
  if (!contractId) throw createError({ statusCode: 400, statusMessage: 'Contrato inválido.' })

  const contract = await getContractForClient(client, portalUserId, contractId)
  if (!contract) throw createError({ statusCode: 404, statusMessage: 'Contrato não encontrado.' })

  const roles = await rolesInContract(client, portalUserId, contractId)
  return await listDocumentsForClient(client, contractId, roles)
})
