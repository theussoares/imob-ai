import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~~/shared/types/database.types'
import {
  canAccessPortal,
  portalEntitlementStatus,
  todayISODate,
  type PortalEntitlementStatus,
} from '~~/shared/utils/portal-entitlement'

type Client = SupabaseClient<Database>

/**
 * O entitlement do recurso "portal" para este tenant.
 *
 * ⚠️ Lê por SERVICE ROLE porque `tenant_features` só tem policy de leitura para
 * MEMBRO do tenant (`tenant_features_member_read`, migration 0032). Nem o
 * cliente do portal nem o visitante anônimo do site enxergam a tabela — e os
 * dois precisam do resultado: um para entrar, o outro para saber se o link
 * "Área do Cliente" deve existir.
 *
 * A query é escopada por tenant e por feature, e devolve uma linha. A regra em
 * si (ativo / carência / suspenso) mora em `shared/utils/portal-entitlement.ts`
 * e é a mesma que a 0032 pôs dentro de `is_portal_user()`.
 */
export async function portalEntitlementFor(
  service: Client,
  tenantId: string,
): Promise<PortalEntitlementStatus> {
  const { data } = await service
    .from('tenant_features')
    .select('enabled, grace_until')
    .eq('tenant_id', tenantId)
    .eq('feature', 'portal')
    .maybeSingle()

  return portalEntitlementStatus(
    data ? { enabled: data.enabled, graceUntil: data.grace_until } : null,
    todayISODate(),
  )
}

/**
 * O site deste tenant deve mostrar a porta de entrada da Área do Cliente?
 *
 * Carência conta como sim, pela mesma razão que ela conta no login: o cliente
 * final não pode ser o primeiro a saber que a imobiliária atrasou um pagamento.
 *
 * Em caso de falha na leitura, devolve `false` — sem entitlement confirmado,
 * nenhum link. É o lado seguro: link que leva a um login que recusa a pessoa é
 * pior do que link nenhum, porque ela vai ligar para a imobiliária dizendo que
 * "o site não deixa entrar".
 */
export async function isPortalVisibleFor(service: Client, tenantId: string): Promise<boolean> {
  try {
    return canAccessPortal(await portalEntitlementFor(service, tenantId))
  } catch (e) {
    logWarn('portal.entitlement_lookup_failed', { tenant: tenantId, reason: errMessage(e) })
    return false
  }
}
