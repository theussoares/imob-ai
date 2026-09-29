import type { ListingContactSettings } from '~~/shared/models/broker'
import { isWhatsappTarget } from '~~/shared/models/broker'
import { setListingContactSettings } from '~~/server/repositories/tenant.repository'

/**
 * Grava os DOIS campos juntos, sempre. Um PUT parcial deixaria a tela, que
 * mostra os dois lado a lado, afirmar um estado que ninguém confirmou no
 * banco — e aqui o erro é o celular do corretor indo ou não para o site.
 */
export default defineEventHandler(async (event) => {
  const { client, tenant } = await requireTenantMember(event)
  const body = await readBody<Partial<Record<keyof ListingContactSettings, unknown>>>(event)
  if (typeof body?.showListingBroker !== 'boolean' || !isWhatsappTarget(body?.whatsappTarget)) {
    throw createError({ statusCode: 422, statusMessage: 'Configuração de contato inválida.' })
  }
  const settings: ListingContactSettings = {
    showListingBroker: body.showListingBroker,
    whatsappTarget: body.whatsappTarget,
  }
  await setListingContactSettings(client, tenant.id, settings)
  // A regra é aplicada na leitura do imóvel, que tem cache de 60s por tenant.
  // Limpa só a instância que atendeu o PUT; as outras esperam o TTL (ver cache.ts).
  await invalidateTenantCache(tenant.id)
  return settings
})
