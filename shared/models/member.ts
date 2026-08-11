export type MemberRole = 'owner' | 'admin'

export interface TenantMember {
  id: string
  tenantId: string
  userId: string
  role: MemberRole
}
