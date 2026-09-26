import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '~~/shared/types/database.types'
import type {
  LeadEvent,
  LeadTask,
  LeadTaskInput,
  LeadTaskUpdateInput,
  NewLeadEvent,
} from '~~/shared/models/lead-activity'
import { toLeadEventModel, toLeadTaskModel, type TaskEmbeds } from '~~/server/mappers/lead-activity.mapper'

type Client = SupabaseClient<Database>
type TaskRow = Database['public']['Tables']['lead_tasks']['Row']
type TaskUpdateRow = Database['public']['Tables']['lead_tasks']['Update']

const TASK_SELECT = '*, leads(name, phone, stage), properties(code, title)'

/** Linha do tempo de um lead, mais recente primeiro. */
export async function listLeadEvents(client: Client, tenantId: string, leadId: string): Promise<LeadEvent[]> {
  const { data, error } = await client
    .from('lead_events')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('lead_id', leadId)
    .order('occurred_at', { ascending: false })
    .limit(200)
  if (error) throw error
  return (data ?? []).map(toLeadEventModel)
}

/**
 * Grava eventos na linha do tempo. `tenantId` e `leadId` são do servidor; a FK
 * composta (0049) recusa lead de outro tenant mesmo que um dos dois venha
 * errado.
 */
export async function insertLeadEvents(
  client: Client,
  tenantId: string,
  leadId: string,
  events: (NewLeadEvent & { occurredAt?: string | null })[],
  createdBy: string | null,
): Promise<LeadEvent[]> {
  if (!events.length) return []
  const { data, error } = await client
    .from('lead_events')
    .insert(
      events.map((e) => ({
        tenant_id: tenantId,
        lead_id: leadId,
        kind: e.kind,
        body: e.body,
        meta: e.meta as Json,
        ...(e.occurredAt ? { occurred_at: e.occurredAt } : {}),
        created_by: createdBy,
      })),
    )
    .select('*')
  if (error) throw error
  return (data ?? []).map(toLeadEventModel)
}

export interface TaskFilter {
  leadId?: string
  brokerId?: string
  /** Só abertas (nem concluídas nem canceladas). */
  openOnly?: boolean
  /** Até esta data (inclusive) — a agenda não precisa do ano inteiro. */
  until?: string
}

export async function listTasks(client: Client, tenantId: string, filter: TaskFilter = {}): Promise<LeadTask[]> {
  let q = client.from('lead_tasks').select(TASK_SELECT).eq('tenant_id', tenantId)
  if (filter.leadId) q = q.eq('lead_id', filter.leadId)
  if (filter.brokerId) q = q.eq('broker_id', filter.brokerId)
  if (filter.openOnly) q = q.is('done_at', null).is('canceled_at', null)
  if (filter.until) q = q.lte('due_at', filter.until)
  const { data, error } = await q.order('due_at', { ascending: true }).limit(500)
  if (error) throw error
  return ((data ?? []) as unknown as (TaskRow & TaskEmbeds)[]).map(toLeadTaskModel)
}

export async function createTask(
  client: Client,
  tenantId: string,
  input: LeadTaskInput,
  createdBy: string | null,
): Promise<LeadTask> {
  const { data, error } = await client
    .from('lead_tasks')
    .insert({
      tenant_id: tenantId,
      lead_id: input.leadId || null,
      property_id: input.propertyId || null,
      broker_id: input.brokerId || null,
      kind: input.kind,
      title: input.title.trim(),
      due_at: new Date(input.dueAt).toISOString(),
      created_by: createdBy,
    })
    .select(TASK_SELECT)
    .single()
  if (error) throw error
  return toLeadTaskModel(data as unknown as TaskRow & TaskEmbeds)
}

/**
 * Atualiza uma tarefa. Devolve também o estado ANTERIOR de conclusão, para o
 * endpoint gravar o evento "tarefa concluída" só na transição — concluir duas
 * vezes (dois cliques, duas abas) não pode virar dois registros no histórico.
 *
 * A transição é garantida no banco, não na leitura: concluir filtra por
 * `done_at is null`, então a segunda requisição não acha linha e devolve
 * `concluiuAgora: false`.
 */
export async function updateTask(
  client: Client,
  tenantId: string,
  id: string,
  input: LeadTaskUpdateInput,
  userId: string | null,
): Promise<{ task: LeadTask; concluiuAgora: boolean } | null> {
  const patch: TaskUpdateRow = {}
  if (input.title !== undefined) patch.title = input.title.trim()
  if (input.dueAt !== undefined) patch.due_at = new Date(input.dueAt).toISOString()
  if (input.brokerId !== undefined) patch.broker_id = input.brokerId || null

  const agora = new Date().toISOString()
  if (input.done === true) Object.assign(patch, { done_at: agora, done_by: userId, canceled_at: null })
  if (input.done === false) Object.assign(patch, { done_at: null, done_by: null })
  if (input.canceled === true) Object.assign(patch, { canceled_at: agora, done_at: null, done_by: null })
  if (input.canceled === false) patch.canceled_at = null

  if (input.done === true) {
    const { data, error } = await client
      .from('lead_tasks')
      .update(patch)
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .is('done_at', null)
      .select(TASK_SELECT)
      .maybeSingle()
    if (error) throw error
    if (data) return { task: toLeadTaskModel(data as unknown as TaskRow & TaskEmbeds), concluiuAgora: true }
    // Já estava concluída (ou não existe): relê para devolver o estado real.
    const atual = await getTask(client, tenantId, id)
    return atual ? { task: atual, concluiuAgora: false } : null
  }

  const { data, error } = await client
    .from('lead_tasks')
    .update(patch)
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .select(TASK_SELECT)
    .maybeSingle()
  if (error) throw error
  return data ? { task: toLeadTaskModel(data as unknown as TaskRow & TaskEmbeds), concluiuAgora: false } : null
}

export async function getTask(client: Client, tenantId: string, id: string): Promise<LeadTask | null> {
  const { data, error } = await client
    .from('lead_tasks')
    .select(TASK_SELECT)
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data ? toLeadTaskModel(data as unknown as TaskRow & TaskEmbeds) : null
}
