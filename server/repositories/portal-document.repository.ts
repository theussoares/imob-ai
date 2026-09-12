import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~~/shared/types/database.types'
import type {
  ContractPartyRole,
  PortalDocument,
  PortalDocumentInput,
  PortalDocumentUpdateInput,
} from '~~/shared/models/portal'
import { toPortalDocumentModel } from '~~/server/mappers/portal-document.mapper'
import { canClientSeeDocument, visibleDocumentsFor } from '~~/shared/utils/portal-access'
import { isPortalDocPathFor } from '~~/shared/utils/portal-doc-path'
import { getContract } from '~~/server/repositories/contract.repository'

type Client = SupabaseClient<Database>

/** A linha crua, para o servidor assinar o download. Não vai para o navegador. */
export interface DocumentForDownload {
  id: string
  tenantId: string
  contractId: string
  storagePath: string
  mime: string | null
  audience: ContractPartyRole[]
  publishedAt: string | null
}

// ---------------------------------------------------------------------------
// Painel
// ---------------------------------------------------------------------------

/** Documentos de um contrato, do ponto de vista da imobiliária (inclui rascunho). */
export async function listDocumentsForContract(
  client: Client,
  tenantId: string,
  contractId: string,
): Promise<PortalDocument[]> {
  const { data, error } = await client
    .from('portal_documents')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('contract_id', contractId)
    .order('competence', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(toPortalDocumentModel)
}

/**
 * Cadastra o documento cujo arquivo JÁ está no bucket.
 *
 * A ordem — arquivo primeiro, linha depois — é o que permite que as policies de
 * storage façam o trabalho delas: o upload sai do navegador com o token do
 * membro, então um membro de outra imobiliária é recusado pelo próprio Storage.
 *
 * ⚠️ `storagePath` chega do cliente e é conferido aqui contra o slug e o
 * contrato. As policies de storage NÃO cobrem esta coluna: ela é texto livre, e
 * uma linha apontando para o arquivo de outro tenant seria uma linha válida para
 * o banco — e `portal_can_read_doc_path` passaria a casar com aquele objeto.
 */
export async function createPortalDocument(
  client: Client,
  args: { tenantId: string; tenantSlug: string; contractId: string; createdBy: string },
  input: PortalDocumentInput,
): Promise<PortalDocument> {
  const contract = await getContract(client, args.tenantId, args.contractId)
  if (!contract) throw createError({ statusCode: 404, statusMessage: 'Contrato não encontrado.' })

  if (!isPortalDocPathFor(input.storagePath, args.tenantSlug, args.contractId)) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Caminho de arquivo inválido para este contrato.',
    })
  }

  const { data, error } = await client
    .from('portal_documents')
    .insert({
      tenant_id: args.tenantId,
      contract_id: args.contractId,
      category: input.category,
      title: input.title.trim(),
      competence: input.competence || null,
      due_on: input.dueOn || null,
      amount: input.amount ?? null,
      storage_path: input.storagePath,
      mime: input.mime || null,
      size_bytes: input.sizeBytes ?? null,
      audience: input.audience,
      // Rascunho por padrão. Publicar é um ato, não o efeito colateral de subir
      // um arquivo.
      published_at: input.publish ? new Date().toISOString() : null,
      created_by: args.createdBy,
    })
    .select('*')
    .single()
  if (error) throw error
  return toPortalDocumentModel(data)
}

/**
 * Edita o que a imobiliária digitou, e publica ou despublica.
 *
 * `storage_path` não está entre os campos alteráveis: trocar o arquivo de um
 * documento já publicado mudaria silenciosamente o que o cliente baixa de um
 * link que ele já tem. Arquivo errado se resolve excluindo e subindo de novo.
 */
export async function updatePortalDocument(
  client: Client,
  tenantId: string,
  documentId: string,
  input: PortalDocumentUpdateInput,
): Promise<PortalDocument> {
  const patch: Database['public']['Tables']['portal_documents']['Update'] = {}
  if (input.category !== undefined) patch.category = input.category
  if (input.title !== undefined) patch.title = input.title.trim()
  if (input.competence !== undefined) patch.competence = input.competence || null
  if (input.dueOn !== undefined) patch.due_on = input.dueOn || null
  if (input.amount !== undefined) patch.amount = input.amount ?? null
  if (input.audience !== undefined) patch.audience = input.audience
  // `publish` ausente NÃO mexe na publicação: editar o título de um documento
  // publicado não pode despublicá-lo por omissão.
  if (input.publish !== undefined) {
    patch.published_at = input.publish ? new Date().toISOString() : null
  }

  const { data, error } = await client
    .from('portal_documents')
    .update(patch)
    .eq('tenant_id', tenantId)
    .eq('id', documentId)
    .select('*')
    .maybeSingle()
  if (error) throw error
  if (!data) throw createError({ statusCode: 404, statusMessage: 'Documento não encontrado.' })
  return toPortalDocumentModel(data)
}

/**
 * Exclui o documento e devolve o path do arquivo, para o handler apagar o objeto.
 *
 * A linha sai primeiro. Se a remoção do arquivo falhar depois, sobra um objeto
 * órfão no bucket — invisível, porque `portal_can_read_doc_path` não acha mais
 * linha que case com ele. A ordem inversa deixaria o oposto: linha viva
 * apontando para arquivo que não existe, e o cliente clicando em "baixar" para
 * receber erro.
 */
export async function deletePortalDocument(
  client: Client,
  tenantId: string,
  documentId: string,
): Promise<{ storagePath: string }> {
  const { data, error } = await client
    .from('portal_documents')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('id', documentId)
    .select('storage_path')
    .maybeSingle()
  if (error) throw error
  if (!data) throw createError({ statusCode: 404, statusMessage: 'Documento não encontrado.' })
  return { storagePath: data.storage_path }
}

// ---------------------------------------------------------------------------
// Portal
// ---------------------------------------------------------------------------

/**
 * Documentos que ESTE cliente pode ver neste contrato.
 *
 * A filtragem acontece em DOIS lugares, e não é redundância:
 *
 *   1. a RLS já filtra por publicação, vínculo e audiência (migration 0028);
 *   2. `visibleDocumentsFor` aplica a mesma regra aqui.
 *
 * A segunda existe porque nada garante que este repositório seja sempre chamado
 * com o client do usuário. No dia em que alguém passar service role — para
 * enriquecer uma resposta, para um relatório, por pressa — a RLS deixa de rodar
 * e esta linha é o que continua de pé.
 */
export async function listDocumentsForClient(
  client: Client,
  contractId: string,
  roles: readonly ContractPartyRole[],
): Promise<PortalDocument[]> {
  const { data, error } = await client
    .from('portal_documents')
    .select('*')
    .eq('contract_id', contractId)
    .not('published_at', 'is', null)
    .order('competence', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error

  const docs = (data ?? []).map(toPortalDocumentModel)
  return visibleDocumentsFor(docs, roles)
}

/**
 * A linha necessária para assinar o download, já conferida.
 *
 * ⚠️ Devolve `null` quando o cliente não pode ver o documento — e é ESTA função
 * que decide, não o handler. O caminho do download é o único que roda com
 * privilégio suficiente para ignorar a RLS (a assinatura precisa alcançar o
 * bucket privado), então a checagem tem que morar em algum lugar que não dê para
 * esquecer de chamar. Está aqui, junto da leitura do path.
 *
 * `roles` são os papéis desta pessoa NESTE contrato, vindos de
 * `rolesInContract`. Vazio significa que ela não é parte, e nada é devolvido.
 */
export async function getDocumentForDownload(
  client: Client,
  documentId: string,
  roles: readonly ContractPartyRole[],
): Promise<DocumentForDownload | null> {
  const { data, error } = await client
    .from('portal_documents')
    .select('id, tenant_id, contract_id, storage_path, mime, audience, published_at')
    .eq('id', documentId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null

  if (!canClientSeeDocument({ audience: data.audience, publishedAt: data.published_at }, roles)) {
    return null
  }

  return {
    id: data.id,
    tenantId: data.tenant_id,
    contractId: data.contract_id,
    storagePath: data.storage_path,
    mime: data.mime,
    audience: data.audience,
    publishedAt: data.published_at,
  }
}

/**
 * Grava a trilha de acesso.
 *
 * Vai por service role de propósito: se o próprio cliente pudesse inserir aqui,
 * poderia forjar linhas e o registro deixaria de valer como prova de quem
 * acessou o quê.
 */
export async function logDocumentAccess(
  service: Client,
  args: { tenantId: string; documentId: string; portalUserId: string; ip: string | null },
): Promise<void> {
  const { error } = await service.from('portal_document_access').insert({
    tenant_id: args.tenantId,
    document_id: args.documentId,
    portal_user_id: args.portalUserId,
    ip: args.ip,
  })
  // Falha na trilha NÃO derruba o download: o cliente tem direito ao documento
  // dele, e perder uma linha de auditoria é menos grave que negar acesso
  // legítimo. Mas tem que gritar no log, ou a trilha degrada em silêncio.
  if (error) logError('portal.access_log_failed', { documentId: args.documentId })
}
