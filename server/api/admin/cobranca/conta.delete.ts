import { deletePaymentAccount, getPaymentAccount } from '~~/server/repositories/cobranca.repository'

/**
 * Desconecta a conta. Os boletos já emitidos continuam válidos no provedor —
 * mas, sem o webhook, o pagamento deles não baixa mais aqui sozinho. A tela
 * avisa isso antes do clique.
 */
export default defineEventHandler(async (event) => {
  const { tenant, membership } = await requireTenantMember(event)
  if (membership.role !== 'owner') {
    throw createError({ statusCode: 403, statusMessage: 'Só o responsável pela conta da imobiliária pode desconectar a cobrança.' })
  }
  const service = serviceSupabase()
  const conta = await getPaymentAccount(service, tenant.id)
  if (conta?.provider === 'asaas' && conta.external_webhook_id) {
    try {
      await provedorDaConta(conta).removerWebhook(conta.external_webhook_id)
    } catch (e) {
      logWarn('cobranca.webhook_nao_removido', { tenant: tenant.slug, reason: errMessage(e) })
    }
  }
  await deletePaymentAccount(service, tenant.id)
  return { ok: true }
})
