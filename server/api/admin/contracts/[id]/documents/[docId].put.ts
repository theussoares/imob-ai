import type { PortalDocumentUpdateInput } from '~~/shared/models/portal'
import { updatePortalDocument } from '~~/server/repositories/portal-document.repository'

/**
 * Edita os campos digitados do documento, publica ou despublica.
 *
 * Despublicar é o botão de arrependimento: o documento subiu para o público
 * errado, ou o valor estava errado, e tirar do ar precisa ser tão fácil quanto
 * pôr. `published_at` volta a nulo e o documento some do portal na hora — sem
 * apagar o arquivo, que pode ser republicado depois da correção.
 */
export default defineEventHandler(async (event) => {
  const { client, tenant } = await requireTenantMember(event)
  const documentId = getRouterParam(event, 'docId')
  if (!documentId) throw createError({ statusCode: 400, statusMessage: 'Documento inválido.' })

  const body = await readBody<PortalDocumentUpdateInput>(event)
  assertPortalDocumentUpdateInput(body)

  return updatePortalDocument(client, tenant.id, documentId, body)
})
