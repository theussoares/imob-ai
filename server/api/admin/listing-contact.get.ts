import { getListingContactSettings } from '~~/server/repositories/tenant.repository'

/** Como a página do imóvel mostra o contato: captador visível e destino do WhatsApp (0059). */
export default defineEventHandler(async (event) => {
  const { client, tenant } = await requireTenantMember(event)
  return getListingContactSettings(client, tenant.id)
})
