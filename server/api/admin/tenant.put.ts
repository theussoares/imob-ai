import type { TenantSettingsInput } from '~~/shared/models/tenant'
import { updateTenantSettings } from '~~/server/repositories/tenant.repository'

/** Salva as configurações da imobiliária (branding, contato, textos). */
export default defineEventHandler(async (event) => {
  const { client, tenant, user } = await requireTenantMember(event)
  const body = await readBody<TenantSettingsInput>(event)
  assertTenantSettingsInput(body)
  const updated = await updateTenantSettings(client, tenant.id, body, user.id)
  await invalidateTenantCache(tenant.id)
  clearTenantHostCache()
  return updated
})
