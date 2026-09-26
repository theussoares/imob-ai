import type { LeadTaskInput } from '~~/shared/models/lead-activity'
import { createTask } from '~~/server/repositories/lead-activity.repository'

/**
 * Tarefa nova. Contato, imóvel e corretor vêm do body, e é a FK composta
 * (tenant_id junto, 0049) que impede apontar para os de outra imobiliária:
 * o banco devolve 23503 e aqui vira 422.
 */
export default defineEventHandler(async (event) => {
  const { client, tenant, user } = await requireTenantMember(event)
  const body = await readBody<LeadTaskInput>(event)
  assertLeadTaskInput(body)
  try {
    return await createTask(client, tenant.id, body, user.id)
  } catch (e) {
    if ((e as { code?: string })?.code === '23503') {
      throw createError({ statusCode: 422, statusMessage: 'Contato, imóvel ou corretor não encontrado.' })
    }
    throw e
  }
})
