import type { Database } from '~~/shared/types/database.types'
import type { PortalUser } from '~~/shared/models/portal'

type PortalUserRow = Database['public']['Tables']['portal_users']['Row']

/** Visão do PAINEL: a imobiliária vê o cadastro completo do cliente dela. */
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
 * O que o CLIENTE sabe sobre si mesmo no portal: o nome, para dizer "olá".
 *
 * `doc` (CPF/CNPJ) e `phone` ficam fora não por serem secretos para o titular,
 * mas porque o portal não tem tela que os use — e campo que atravessa a API sem
 * destino é campo que vaza em log, em cache e no próximo `console.log` de
 * depuração.
 */
export function toPortalUserSelf(row: Pick<PortalUserRow, 'id' | 'name'>): { id: string; name: string } {
  return { id: row.id, name: row.name }
}
