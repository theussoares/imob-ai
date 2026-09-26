import type { PortalDocumentInput } from '~~/shared/models/portal'
import {
  assertCaminhoDoTenant,
  createDocument,
  inspecionarArquivoEnviado,
} from '~~/server/repositories/portal-document.repository'

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

  // O caminho é conferido ANTES de abrir o arquivo: `inspecionar` apaga o que
  // recusa, e não pode apagar nada fora da pasta desta imobiliária.
  assertCaminhoDoTenant(body.storagePath, tenant.slug)
  // O mime e o tamanho gravados são os do arquivo, não os que o navegador disse.
  const real = await inspecionarArquivoEnviado(client, body.storagePath)

  return createDocument(client, tenant.id, tenant.slug, { ...body, ...real }, user?.id ?? null)
})
