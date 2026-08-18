import type { LeadCreateInput } from '~~/shared/models/lead'
import { createManualLead } from '~~/server/repositories/lead.repository'

/** Cadastro manual de um contato (lead que chegou por outro canal). */
export default defineEventHandler(async (event) => {
  const { client, tenant } = await requireTenantMember(event)
  const body = await readBody<LeadCreateInput>(event)
  assertLeadCreateInput(body)
  return createManualLead(client, tenant.id, body)
})
