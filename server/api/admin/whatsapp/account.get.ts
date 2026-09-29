import type { WhatsappAccountInfo } from '~~/shared/models/whatsapp'
import { getActiveAccount } from '~~/server/repositories/whatsapp.repository'
import { whatsappAppSecret, whatsappVerifyToken } from '~~/server/utils/whatsapp-config'

/** O número conectado, sem o token — é tudo o que a tela de Configurações precisa. */
export default defineEventHandler(async (event): Promise<WhatsappAccountInfo> => {
  const { tenant } = await requireTenantMember(event)
  await exigirWhatsapp(tenant.id)
  const conta = await getActiveAccount(serviceSupabase(), tenant.id)
  const host = getRequestURL(event, { xForwardedHost: true }).host
  return {
    conectado: Boolean(conta?.accessTokenEnc),
    displayPhone: conta?.displayPhone ?? null,
    verifiedName: conta?.verifiedName ?? null,
    phoneNumberId: conta?.phoneNumberId ?? null,
    // Sempre https: atrás do proxy da Vercel a requisição chega como http, e a
    // Meta recusa callback que não seja https.
    webhookUrl: `https://${host}/api/webhooks/whatsapp`,
    plataformaPronta: Boolean(whatsappAppSecret() && whatsappVerifyToken()),
  }
})
