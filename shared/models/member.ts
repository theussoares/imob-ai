/**
 * Papel no painel.
 *
 * `broker` é o corretor: entra, mas enxerga só a própria carteira de leads e não
 * mexe em configuração da imobiliária, cadastro de corretores nem acessos. Quem
 * decide isso é a RLS (migration 0029) mais `requireTenantAdmin` nos endpoints
 * que rodam por service role, onde a RLS não alcança.
 */
export type MemberRole = 'owner' | 'admin' | 'broker'

/** Papéis que enxergam e administram a imobiliária inteira. */
export const ADMIN_ROLES: MemberRole[] = ['owner', 'admin']

export function isAdminRole(role: string): boolean {
  return ADMIN_ROLES.includes(role as MemberRole)
}

export interface TenantMember {
  id: string
  tenantId: string
  userId: string
  role: MemberRole
}
