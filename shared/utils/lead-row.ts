import type { Lead, LeadStage } from '~~/shared/models/lead'
import { toLeadSource, toLeadType } from '~~/shared/models/lead'

/** Linha crua de `leads` como o Realtime entrega: snake_case, sem embeds. */
type RawLeadRow = Record<string, unknown>

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const nullable = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)

/**
 * Reconstrói um `Lead` a partir do payload do Realtime.
 *
 * O payload é a linha do banco, sem o `properties(code, title)` que a listagem
 * traz por embed. Por isso o imóvel é copiado do que já está na tela: sem isso o
 * card perderia o link toda vez que alguém movesse o contato, e o corretor
 * deixaria de ver sobre o que era o contato.
 *
 * `expectedTenantId` é cinto de segurança. A assinatura já filtra por tenant no
 * servidor; aplicar o payload sem conferir seria confiar em um único controle
 * para separar clientes.
 *
 * Devolve `null` quando o payload não serve — quem chama deve ignorá-lo.
 */
export function leadFromRealtimeRow(row: RawLeadRow, existing?: Lead, expectedTenantId?: string): Lead | null {
  const id = str(row.id)
  if (!id) return null
  const tenantId = str(row.tenant_id)
  if (expectedTenantId && tenantId !== expectedTenantId) return null

  return {
    id,
    tenantId,
    propertyId: nullable(row.property_id),
    name: nullable(row.name),
    phone: nullable(row.phone),
    message: nullable(row.message),
    source: toLeadSource(row.source),
    leadType: toLeadType(row.lead_type),
    // `stage` tem CHECK no banco; o valor não passa por normalização pelo mesmo
    // motivo que no mapper do servidor.
    stage: str(row.stage) as LeadStage,
    notes: nullable(row.notes),
    nextContactAt: nullable(row.next_contact_at),
    brokerId: nullable(row.broker_id),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
    updatedBy: nullable(row.updated_by),
    property: existing?.property ?? null,
  }
}
