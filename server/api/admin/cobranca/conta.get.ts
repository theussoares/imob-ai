import { getPaymentAccount } from '~~/server/repositories/cobranca.repository'
import { toPaymentAccountView } from '~~/server/mappers/cobranca.mapper'

/**
 * A conta de cobrança da imobiliária, como o painel pode vê-la.
 *
 * Lida pela service_role porque `tenant_payment_accounts` não tem grant nem
 * para o membro (0051) — e é o recorte do mapper, não a RLS, que garante que
 * nem a chave cifrada nem o hash do webhook saiam daqui.
 */
export default defineEventHandler(async (event) => {
  const { tenant } = await requireTenantMember(event)
  const conta = await getPaymentAccount(serviceSupabase(), tenant.id)
  return { conta: conta ? toPaymentAccountView(conta) : null }
})
