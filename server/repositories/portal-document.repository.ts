import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~~/shared/types/database.types'
import type { ContractPartyRole, PortalDocument } from '~~/shared/models/portal'
import { visibleDocumentsFor } from '~~/shared/utils/portal-access'
import {
  toPortalDocumentModel,
  toPortalDocumentWithPath,
  type PortalDocumentWithPath,
} from '~~/server/mappers/portal-document.mapper'

type Client = SupabaseClient<Database>

/** Documentos de um contrato, para o PAINEL — rascunho incluído. */
export async function listDocuments(
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
 * Documentos que ESTE cliente pode ver neste contrato.
 *
 * Filtra três vezes o mesmo fato, e nenhuma das três é sobra:
 *   - a query pede publicados e do contrato certo;
 *   - a RLS da 0028 aplica a regra de novo no banco;
 *   - `visibleDocumentsFor` aplica a regra de audiência em TypeScript.
 *
 * A terceira é a que importa quando o chamador passa o client de service role,
 * que ignora RLS. Ela é a mesma função que o download usa antes de assinar —
 * lista e download respondendo pela mesma regra é o que impede a lista dizer
 * uma coisa e o download outra.
 */
export async function listDocumentsForClient(
  client: Client,
  tenantId: string,
  contractId: string,
  roles: readonly ContractPartyRole[],
): Promise<PortalDocument[]> {
  // Sem papel no contrato não há documento visível, e a viagem ao banco não
  // tem como terminar em outra resposta.
  if (!roles.length) return []

  const { data, error } = await client
    .from('portal_documents')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('contract_id', contractId)
    .not('published_at', 'is', null)
    .order('competence', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error

  return visibleDocumentsFor((data ?? []).map(toPortalDocumentModel), roles)
}

/**
 * O documento com o caminho no bucket, para assinar o download.
 *
 * NÃO checa permissão: quem chama tem que aplicar `canClientSeeDocument` com os
 * papéis da pessoa naquele contrato antes de assinar. A separação é proposital
 * — uma função que buscasse e autorizasse ao mesmo tempo tornaria fácil chamar
 * só a busca e achar que a autorização veio junto.
 */
export async function getDocumentWithPath(
  client: Client,
  tenantId: string,
  documentId: string,
): Promise<PortalDocumentWithPath | null> {
  const { data, error } = await client
    .from('portal_documents')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', documentId)
    .maybeSingle()
  if (error) throw error
  return data ? toPortalDocumentWithPath(data) : null
}

/**
 * Registra o download na trilha (LGPD).
 *
 * Falha de gravação NÃO derruba o download: o cliente tem direito ao documento
 * dele, e negar o arquivo porque o log caiu troca um problema de auditoria por
 * um de acesso. Mas também não passa em silêncio — o erro sobe para quem chama
 * registrar no log da aplicação.
 */
export async function recordDocumentAccess(
  service: Client,
  tenantId: string,
  documentId: string,
  portalUserId: string,
  ip: string | null,
): Promise<void> {
  const { error } = await service.from('portal_document_access').insert({
    tenant_id: tenantId,
    document_id: documentId,
    portal_user_id: portalUserId,
    ip,
  })
  if (error) throw error
}
