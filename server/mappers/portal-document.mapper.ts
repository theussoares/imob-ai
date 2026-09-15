import type { Database } from '~~/shared/types/database.types'
import type { ContractPartyRole, PortalDocument } from '~~/shared/models/portal'

type PortalDocumentRow = Database['public']['Tables']['portal_documents']['Row']

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
