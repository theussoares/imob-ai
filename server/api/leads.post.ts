import type { LeadInput } from '~~/shared/models/lead'
import { isValidBrPhone, onlyDigits } from '~~/shared/utils/phone'
import { createLead } from '~~/server/repositories/lead.repository'
import { getPropertyByCode } from '~~/server/repositories/property.repository'

/** Registra um lead do formulário de contato público. */
export default defineEventHandler(async (event) => {
  const tenant = useTenantContext(event)
  const body = await readBody<LeadInput>(event)

  const name = (body?.name || '').trim()
  const phone = onlyDigits(body?.phone)
  if (!name) {
    throw createError({ statusCode: 422, statusMessage: 'Nome é obrigatório.' })
  }
  if (!isValidBrPhone(phone)) {
    throw createError({ statusCode: 422, statusMessage: 'Telefone inválido.' })
  }

  const client = publicSupabase()
  let propertyId: string | null = null
  if (body.propertyCode) {
    const property = await getPropertyByCode(client, tenant.id, body.propertyCode)
    propertyId = property?.id ?? null
  }

  await createLead(client, {
    tenantId: tenant.id,
    propertyId,
    name,
    phone,
    message: body.message?.trim() || null,
    source: body.source || 'form',
  })

  return { ok: true }
})
