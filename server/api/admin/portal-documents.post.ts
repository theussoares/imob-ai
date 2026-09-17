import type { PortalDocumentInput } from '~~/shared/models/portal'
import { createDocument } from '~~/server/repositories/portal-document.repository'

/**
 * Registra um documento já enviado ao bucket, como RASCUNHO.
 *
 * O arquivo sobe direto do navegador para o Storage (as policies da 0028
 * autorizam pela pasta do slug); este endpoint grava os metadados. Por isso o
 * `storagePath` é dado do cliente e é conferido no repositório — ver
 * `assertCaminhoDoTenant`.
 */
export default defineEventHandler(async (event) => {
  const { client, tenant, user } = await requireTenantMember(event)
  const body = await readBody<PortalDocumentInput>(event)
  assertPortalDocumentInput(body)

  return createDocument(client, tenant.id, tenant.slug, body, user?.id ?? null)
})
