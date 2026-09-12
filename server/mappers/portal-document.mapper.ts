import type { Database } from '~~/shared/types/database.types'
import type { PortalDocument } from '~~/shared/models/portal'

type DocumentRow = Database['public']['Tables']['portal_documents']['Row']

/**
 * ⚠️ `storage_path` NÃO entra no modelo.
 *
 * O caminho do arquivo no bucket não serve a nenhuma tela: o download acontece
 * por um endpoint que confere a permissão e assina a URL. Devolver o path para o
 * navegador entrega a chave de busca do objeto — inútil sozinha, porque o bucket
 * é privado, e exatamente o que um atacante usaria no dia em que uma policy de
 * storage for afrouxada por engano.
 *
 * Quem precisa do path é o servidor, que lê a linha crua.
 */
export function toPortalDocumentModel(row: DocumentRow): PortalDocument {
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
    audience: row.audience,
    publishedAt: row.published_at,
    createdAt: row.created_at,
  }
}
