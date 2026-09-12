import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~~/shared/types/database.types'
import type { ContractPartyRole, PortalDocument } from '~~/shared/models/portal'
import { toPortalDocumentModel } from '~~/server/mappers/portal-document.mapper'
import { canClientSeeDocument, visibleDocumentsFor } from '~~/shared/utils/portal-access'

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
