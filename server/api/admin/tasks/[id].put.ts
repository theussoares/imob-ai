import type { LeadTaskUpdateInput } from '~~/shared/models/lead-activity'
import { LEAD_TASK_LABELS } from '~~/shared/models/lead-activity'
import { updateTask } from '~~/server/repositories/lead-activity.repository'
import { registrarEventos } from '~~/server/utils/lead-crm'

/** Concluir, cancelar, reagendar ou trocar o dono de uma tarefa. */
export default defineEventHandler(async (event) => {
  const { client, tenant, user } = await requireTenantMember(event)
  const id = idDeRota(getRouterParam(event, 'id'))
  const body = await readBody<LeadTaskUpdateInput>(event)
  assertLeadTaskUpdateInput(body)

  let r
  try {
    r = await updateTask(client, tenant.id, id, body, user.id)
  } catch (e) {
    if ((e as { code?: string })?.code === '23503') {
      throw createError({ statusCode: 422, statusMessage: 'Corretor não encontrado.' })
    }
    throw e
  }
  if (!r) throw createError({ statusCode: 404, statusMessage: 'Tarefa não encontrada.' })

  // Só na transição: `updateTask` garante no banco que a segunda conclusão
  // (duplo clique, duas abas) devolve `concluiuAgora: false`.
  if (r.concluiuAgora && r.task.leadId) {
    await registrarEventos(
      client,
      tenant,
      r.task.leadId,
      [{ kind: 'tarefa', body: `${LEAD_TASK_LABELS[r.task.kind]}: ${r.task.title}`, meta: { taskId: r.task.id } }],
      user.id,
    )
  }
  return r.task
})
