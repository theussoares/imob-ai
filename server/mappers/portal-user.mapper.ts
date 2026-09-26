import type { Database } from '~~/shared/types/database.types'
import type { PortalUser, PortalUserInput } from '~~/shared/models/portal'

type PortalUserRow = Database['public']['Tables']['portal_users']['Row']
type PortalUserInsert = Database['public']['Tables']['portal_users']['Insert']

export function toPortalUserModel(row: PortalUserRow): PortalUser {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    name: row.name,
    email: row.email,
    doc: row.doc,
    phone: row.phone,
    active: row.active,
    createdAt: row.created_at,
  }
}

/**
 * O `user_id` não vem do payload: ele é o id no Auth, e quem o produz é o
 * convite (`generateLink`), não o formulário. Recebê-lo de fora deixaria o
 * painel apontar um cadastro para a conta de outra pessoa.
 */
export function toPortalUserRow(
  input: PortalUserInput,
  tenantId: string,
  userId: string,
): PortalUserInsert {
  return {
    tenant_id: tenantId,
    user_id: userId,
    name: input.name.trim(),
    // O índice único é sobre lower(email); gravar normalizado evita que o banco
    // e a aplicação discordem sobre o que é o "mesmo" e-mail.
    email: input.email.trim().toLowerCase(),
    doc: input.doc?.trim() || null,
    phone: input.phone?.trim() || null,
  }
}
