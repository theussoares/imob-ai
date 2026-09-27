import { getPaymentAccount } from '~~/server/repositories/cobranca.repository'
import { toPaymentAccountView } from '~~/server/mappers/cobranca.mapper'

/**
 * A conta de cobrança da imobiliária, como o painel pode vê-la.
 *
 * Lida pela service_role porque `tenant_payment_accounts` não tem grant nem
 * para o membro (0051) — e é o recorte do mapper, não a RLS, que garante que
 * nem a chave cifrada nem o hash do webhook saiam daqui.
 *
 * `ultimoAviso`: quando chegou o último evento do provedor DESDE esta conexão.
 * A conexão de 25/09 da demonstração nunca entregou um evento sequer, e ninguém
 * viu — "Simular pagamento" e "Consultar no Asaas" davam baixa sem o webhook
 * (teste de 27/09, MELHORIA 02). Só a data sai; o conteúdo do evento, não.
 */
export default defineEventHandler(async (event) => {
  const { tenant } = await requireTenantMember(event)
  const service = serviceSupabase()
  const conta = await getPaymentAccount(service, tenant.id)
  if (!conta) return { conta: null, ultimoAviso: null }

  const { data: ultimo } = await service
    .from('payment_webhook_events')
    .select('received_at')
    .eq('tenant_id', tenant.id)
    .gte('received_at', conta.connected_at)
    .order('received_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return { conta: toPaymentAccountView(conta), ultimoAviso: (ultimo?.received_at as string | undefined) ?? null }
})
