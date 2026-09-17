import type { Database } from '~~/shared/types/database.types'
import type { ContractPartyRole, PortalDocument, PortalDocumentInput } from '~~/shared/models/portal'
import { defaultAudienceFor } from '~~/shared/utils/portal-access'

type PortalDocumentRow = Database['public']['Tables']['portal_documents']['Row']
type PortalDocumentInsert = Database['public']['Tables']['portal_documents']['Insert']

/**
 * O documento com o caminho no bucket.
 *
 * `PortalDocument` (o modelo de domínio) NÃO tem `storagePath`, e a omissão é
 * deliberada: o cliente nunca fala com o storage direto, e um caminho que chega
 * ao navegador é um caminho que alguém tenta abrir. Este tipo existe só para o
 * servidor assinar o download, e o nome está aqui para que devolvê-lo numa
 * resposta pareça errado na hora de escrever.
 */
export interface PortalDocumentWithPath extends PortalDocument {
  storagePath: string
}

export function toPortalDocumentModel(row: PortalDocumentRow): PortalDocument {
  return {
    id: row.id,
    contractId: row.contract_id,
    category: row.category,
    title: row.title,
    competence: row.competence,
    dueOn: row.due_on,
    amount: row.amount,
    mime: row.mime,
    sizeBytes: row.size_bytes,
    audience: (row.audience ?? []) as ContractPartyRole[],
    publishedAt: row.published_at,
    createdAt: row.created_at,
  }
}

export function toPortalDocumentWithPath(row: PortalDocumentRow): PortalDocumentWithPath {
  return { ...toPortalDocumentModel(row), storagePath: row.storage_path }
}

/**
 * Row de inserção.
 *
 * A audiência cai no default da CATEGORIA quando não vem no payload — e o
 * default é código, não caixinha em branco no formulário. Boleto e recibo
 * nascem só do inquilino; extrato e contrato de administração, só do
 * proprietário. O vazamento clássico desta feature é alguém esquecer de marcar
 * o campo às 18h de uma sexta.
 *
 * Nasce como RASCUNHO (`published_at` nulo) sempre. Publicar é um segundo ato,
 * deliberado: sem isso, a imobiliária sobe 12 documentos ao longo do dia e o
 * cliente vê a lista pela metade, achando que falta coisa.
 */
export function toPortalDocumentRow(
  input: PortalDocumentInput,
  tenantId: string,
  createdBy: string | null,
): PortalDocumentInsert {
  return {
    tenant_id: tenantId,
    contract_id: input.contractId,
    category: input.category,
    title: input.title.trim(),
    competence: input.competence || null,
    due_on: input.dueOn || null,
    amount: input.amount ?? null,
    storage_path: input.storagePath,
    mime: input.mime || null,
    size_bytes: input.sizeBytes ?? null,
    audience: input.audience?.length ? input.audience : defaultAudienceFor(input.category),
    published_at: null,
    created_by: createdBy,
  }
}
