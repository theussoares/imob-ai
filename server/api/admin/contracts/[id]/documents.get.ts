import { listDocumentsForContract } from '~~/server/repositories/portal-document.repository'

/**
 * Documentos de um contrato, do ponto de vista da imobiliária.
 *
 * Inclui RASCUNHO — é a diferença para `/api/portal/contracts/[id]`, que só
 * enxerga o que já foi publicado. Quem sobe o arquivo precisa ver o que ainda
 * não está no ar; o cliente, não.
 */
export default defineEventHandler(async (event) => {
  const { client, tenant } = await requireTenantMember(event)
  const contractId = getRouterParam(event, 'id')
  if (!contractId) throw createError({ statusCode: 400, statusMessage: 'ID inválido.' })

  return listDocumentsForContract(client, tenant.id, contractId)
})
