import type { PortalDocumentInput } from '~~/shared/models/portal'
import { createPortalDocument } from '~~/server/repositories/portal-document.repository'

/**
 * Cadastra o documento cujo arquivo o navegador já subiu para `portal-docs`.
 *
 * O upload NÃO passa por aqui de propósito. Ele sai do navegador com o token do
 * membro, e é isso que faz as policies de storage da 0028 valerem: um membro de
 * outra imobiliária é recusado pelo próprio Storage, sem depender de checagem
 * nossa. Mandar o arquivo pela função e gravar com service role desligaria essa
 * barreira — o mesmo raciocínio do download do card 2.3, na direção contrária.
 *
 * O que este handler faz é o que o Storage não tem como fazer: conferir que o
 * `storagePath` declarado pertence a este contrato desta imobiliária.
 */
export default defineEventHandler(async (event) => {
  const { client, tenant, user } = await requireTenantMember(event)
  const contractId = getRouterParam(event, 'id')
  if (!contractId) throw createError({ statusCode: 400, statusMessage: 'ID inválido.' })

  const body = await readBody<PortalDocumentInput>(event)
  assertPortalDocumentInput(body)

  return createPortalDocument(
    client,
    { tenantId: tenant.id, tenantSlug: tenant.slug, contractId, createdBy: user.id },
    body,
  )
})
