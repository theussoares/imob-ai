import { listTasks } from '~~/server/repositories/lead-activity.repository'
import { ehUuid } from '~~/shared/utils/uuid'

/**
 * Tarefas da agenda. Filtros por query: `leadId`, `brokerId`, `open=1`,
 * `until` (ISO) e `doneSince` (ISO, só as concluídas desde então). Id malformado é recusado em vez de ignorado — ignorar
 * devolveria a agenda INTEIRA para quem pediu a de um corretor.
 */
export default defineEventHandler(async (event) => {
  const { client, tenant } = await requireTenantMember(event)
  const q = getQuery(event)
  const uuid = (v: unknown, rotulo: string) => {
    if (v === undefined || v === '') return undefined
    if (!ehUuid(String(v))) throw createError({ statusCode: 422, statusMessage: `${rotulo} inválido.` })
    return String(v)
  }
  const until = q.until ? new Date(String(q.until)) : null
  if (until && Number.isNaN(until.getTime())) throw createError({ statusCode: 422, statusMessage: 'Data inválida.' })
  const doneSince = q.doneSince ? new Date(String(q.doneSince)) : null
  if (doneSince && Number.isNaN(doneSince.getTime())) throw createError({ statusCode: 422, statusMessage: 'Data inválida.' })

  return listTasks(client, tenant.id, {
    leadId: uuid(q.leadId, 'Contato'),
    brokerId: uuid(q.brokerId, 'Corretor'),
    openOnly: q.open === '1',
    until: until?.toISOString(),
    doneSince: doneSince?.toISOString(),
  })
})
