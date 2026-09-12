import { deletePortalDocument } from '~~/server/repositories/portal-document.repository'

/**
 * Exclui o documento: a linha e o arquivo.
 *
 * A remoção do objeto vai com o CLIENT DO USUÁRIO, não com service role — a
 * policy "member delete portal-docs" da 0028 confere o slug da pasta e recusa
 * quem não é da imobiliária. É a mesma escolha do download: enquanto o storage
 * for tocado com o token de quem pediu, a policy continua sendo uma barreira de
 * verdade.
 *
 * Se o arquivo não sair, a linha já saiu — sobra um objeto órfão no bucket, que
 * ninguém alcança porque não há mais linha que case com ele. Fica no log para
 * ser limpo, e não vira erro na tela: para a imobiliária, o documento sumiu do
 * portal, que é o que ela pediu.
 */
export default defineEventHandler(async (event) => {
  const { client, tenant } = await requireTenantMember(event)
  const documentId = getRouterParam(event, 'docId')
  if (!documentId) throw createError({ statusCode: 400, statusMessage: 'Documento inválido.' })

  const { storagePath } = await deletePortalDocument(client, tenant.id, documentId)

  const { error } = await client.storage.from('portal-docs').remove([storagePath])
  if (error) {
    logError('portal.document_file_orphan', { tenant: tenant.slug, documentId })
  }

  return { ok: true }
})
