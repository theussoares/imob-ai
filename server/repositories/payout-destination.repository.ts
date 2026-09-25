import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~~/shared/types/database.types'
import type { PayoutDestinationInput } from '~~/shared/models/lease'
import { onlyDigits } from '~~/shared/utils/phone'

type Client = SupabaseClient<Database>

/**
 * Destino do repasse de um proprietário (tabela da 0041).
 *
 * DADO BANCÁRIO de pessoa real: nunca sai em payload público, e aqui só entra
 * pelo client do membro (RLS `financeiro_destinos_membro`) com o tenant no
 * filtro. O destino anterior é DESATIVADO, não apagado: um repasse já feito
 * precisa continuar apontando para a conta que de fato usou (spec 21/09).
 */
export async function replacePayoutDestination(
  client: Client,
  tenantId: string,
  portalUserId: string,
  input: PayoutDestinationInput,
  createdBy: string | null,
): Promise<void> {
  const { error: offErr } = await client
    .from('payout_destinations')
    .update({ active: false })
    .eq('tenant_id', tenantId)
    .eq('portal_user_id', portalUserId)
    .eq('active', true)
  if (offErr) throw offErr

  const base = {
    tenant_id: tenantId,
    portal_user_id: portalUserId,
    holder_name: input.holderName.trim(),
    holder_doc: onlyDigits(input.holderDoc),
    created_by: createdBy,
  }
  const row: Database['public']['Tables']['payout_destinations']['Insert'] =
    input.kind === 'pix'
      ? { ...base, kind: 'pix', pix_key_type: input.pixKeyType, pix_key: input.pixKey.trim() }
      : {
          ...base,
          kind: 'conta_bancaria',
          bank_code: input.bankCode,
          branch: input.branch,
          account: input.account,
          account_digit: input.accountDigit?.trim() || null,
          account_type: input.accountType,
        }
  const { error } = await client.from('payout_destinations').insert(row)
  if (error) throw error
}

/** Quais destas pessoas têm destino de repasse ativo — para as pendências. */
export async function portalUsersWithActiveDestination(
  client: Client,
  tenantId: string,
  portalUserIds: string[],
): Promise<Set<string>> {
  if (!portalUserIds.length) return new Set()
  const { data, error } = await client
    .from('payout_destinations')
    .select('portal_user_id')
    .eq('tenant_id', tenantId)
    .eq('active', true)
    .in('portal_user_id', portalUserIds)
  if (error) throw error
  return new Set((data ?? []).map((r) => r.portal_user_id))
}
