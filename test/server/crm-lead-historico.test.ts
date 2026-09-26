import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  assertLeadEventInput,
  assertLeadTaskInput,
  assertLeadUpdateInput,
} from '~~/server/utils/validate'
import { updateTask } from '~~/server/repositories/lead-activity.repository'
import { corretorDoTenant, distribuirPelaRoleta, registrarEventos } from '~~/server/utils/lead-crm'
import { fakeSupabase, hadEq } from '../helpers/fake-supabase'

/**
 * CRM (0049): histórico, agenda e roleta.
 *
 * As ameaças: um membro escrever no histórico um evento que o sistema não
 * gerou ("movido para Fechado"), apontar lead/corretor de OUTRA imobiliária,
 * o histórico duplicar numa conclusão repetida, e a roleta derrubar o
 * formulário público do visitante.
 */

function stubHandlerGlobals(extra: Record<string, unknown>) {
  vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
  vi.stubGlobal('idDeRota', (v: string) => v)
  vi.stubGlobal('getRouterParam', () => 'l1')
  // Estes testes cobrem o comportamento COM o CRM (0049); o modo sem ele tem
  // os próprios testes. `extra` abaixo sobrescreve quando precisar.
  vi.stubGlobal('crmAtivo', async () => true)
  for (const [k, v] of Object.entries(extra)) vi.stubGlobal(k, v)
}

const leadRow = {
  id: 'l1', tenant_id: 't1', property_id: null, name: 'Maria', phone: null, message: null,
  source: 'manual', lead_type: 'busca_compra', stage: 'perdido', lost_reason: 'preco', notes: null,
  next_contact_at: null, broker_id: null, created_at: '', updated_at: '', updated_by: null, ip_hash: null,
  properties: null,
}

describe('validação', () => {
  const comCrm = { crm: true }
  const semCrm = { crm: false }

  test('perder sem motivo é recusado', () => {
    expect(() => assertLeadUpdateInput({ stage: 'perdido' }, comCrm)).toThrow(/motivo/i)
    expect(() => assertLeadUpdateInput({ stage: 'perdido', lostReason: 'inventado' }, comCrm)).toThrow()
    expect(() => assertLeadUpdateInput({ stage: 'perdido', lostReason: 'preco' }, comCrm)).not.toThrow()
  })

  test('tela antiga mandando `notes` recebe erro, não um "salvo" que perdeu a anotação', () => {
    expect(() => assertLeadUpdateInput({ notes: 'liguei' }, comCrm)).toThrow(/histórico/)
    expect(() => assertLeadUpdateInput({ nextContactAt: '2026-10-01' }, comCrm)).toThrow()
  })

  test('sem o CRM (0054), a ficha de antes continua valendo: anotação e retorno direto', () => {
    // A imobiliária sem o recurso vê "Anotações" e "Próximo retorno" — se o
    // servidor recusasse, toda ficha dela daria erro ao salvar.
    expect(() => assertLeadUpdateInput({ notes: 'liguei', nextContactAt: '2026-10-01' }, semCrm)).not.toThrow()
    expect(() => assertLeadUpdateInput({ nextContactAt: 'amanhã' }, semCrm)).toThrow()
    expect(() => assertLeadUpdateInput({ notes: 'x'.repeat(4001) }, semCrm)).toThrow()
  })

  test('evento de sistema não pode ser postado pelo painel', () => {
    for (const kind of ['etapa', 'atribuicao', 'tarefa']) {
      expect(() => assertLeadEventInput({ kind, body: 'Novo → Fechado' })).toThrow(/inválido/)
    }
    expect(() => assertLeadEventInput({ kind: 'ligacao', body: 'Atendeu, pediu fotos' })).not.toThrow()
  })

  test('registro no futuro é recusado: histórico não é agenda', () => {
    const amanha = new Date(Date.now() + 86_400_000).toISOString()
    expect(() => assertLeadEventInput({ kind: 'nota', body: 'x', occurredAt: amanha })).toThrow(/futuro/)
  })

  test('tarefa com id malformado é recusada antes do banco', () => {
    expect(() => assertLeadTaskInput({ kind: 'visita', title: 'Visita', dueAt: '2026-10-01T10:00:00Z', leadId: "1' or 1=1" })).toThrow()
  })
})

describe('PUT /api/admin/leads/[id]', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  async function rodar(results: Parameters<typeof fakeSupabase>[0], body: Record<string, unknown>, crm = true) {
    const fake = fakeSupabase(results)
    stubHandlerGlobals({
      requireTenantMember: async () => ({ client: fake.client, tenant: { id: 't1', slug: 'olmi' }, user: { id: 'u1' } }),
      readBody: async () => body,
      assertLeadUpdateInput,
      crmAtivo: async () => crm,
    })
    const handler = (await import('~~/server/api/admin/leads/[id].put')).default as (e: unknown) => Promise<unknown>
    return { run: () => handler({}), calls: fake.calls }
  }

  test('corretor de outra imobiliária é recusado e o lead não é tocado', async () => {
    const { run, calls } = await rodar(
      { leads: { data: { stage: 'novo', broker_id: null }, error: null }, brokers: { data: null, error: null } },
      { brokerId: '3f0c1f8e-5d7a-4b8e-9a51-2f6d0c7e9b11' },
    )
    await expect(run()).rejects.toMatchObject({ statusCode: 422 })
    expect(hadEq(calls, 'brokers', 'tenant_id')).toBe(true)
    expect(calls.some((c) => c.table === 'leads' && c.method === 'update')).toBe(false)
  })

  test('mover para perdido grava o evento com o tenant da sessão', async () => {
    const { run, calls } = await rodar(
      { leads: [{ data: { stage: 'proposta', broker_id: null }, error: null }, { data: leadRow, error: null }], lead_events: { data: [], error: null } },
      { stage: 'perdido', lostReason: 'preco' },
    )
    await run()
    const update = calls.find((c) => c.table === 'leads' && c.method === 'update')!.args[0] as Record<string, unknown>
    expect(update).toMatchObject({ stage: 'perdido', lost_reason: 'preco', updated_by: 'u1' })
    const ev = (calls.find((c) => c.table === 'lead_events' && c.method === 'insert')!.args[0] as Record<string, unknown>[])[0]!
    expect(ev).toMatchObject({ tenant_id: 't1', lead_id: 'l1', kind: 'etapa', created_by: 'u1' })
  })

  test('sem o CRM (0054): anotação na coluna, retorno como tarefa — nunca `next_contact_at` direto', async () => {
    // `next_contact_at` é derivado das tarefas por trigger desde a 0049. Uma
    // escrita direta sumiria na próxima mudança de tarefa, e quem ligasse o CRM
    // depois acharia na agenda um retorno diferente do que a ficha mostrava.
    const { run, calls } = await rodar(
      {
        leads: [{ data: { stage: 'contato', broker_id: null }, error: null }, { data: leadRow, error: null }],
        lead_tasks: [{ data: null, error: null }, { data: { id: 't', due_at: '2026-10-01T15:00:00Z' }, error: null }],
      },
      { notes: ' liguei, sem resposta ', nextContactAt: '2026-10-01T15:00:00.000Z' },
      false,
    )
    await run()
    const update = calls.find((c) => c.table === 'leads' && c.method === 'update')!.args[0] as Record<string, unknown>
    expect(update.notes).toBe('liguei, sem resposta')
    expect(update).not.toHaveProperty('next_contact_at')
    expect(hadEq(calls, 'lead_tasks', 'tenant_id')).toBe(true)
    const tarefa = calls.find((c) => c.table === 'lead_tasks' && c.method === 'insert')!.args[0] as Record<string, unknown>
    expect(tarefa).toMatchObject({ tenant_id: 't1', lead_id: 'l1', kind: 'retorno' })
  })

  test('sem o CRM, arquivar como perdido não exige motivo — a ficha antiga não pergunta', async () => {
    const { run, calls } = await rodar(
      { leads: [{ data: { stage: 'contato', broker_id: null }, error: null }, { data: leadRow, error: null }] },
      { stage: 'perdido' },
      false,
    )
    await run()
    expect(calls.some((c) => c.table === 'leads' && c.method === 'update')).toBe(true)
  })

  test('lead de outro tenant (ou inexistente) é 404, sem update', async () => {
    const { run, calls } = await rodar({ leads: { data: null, error: null } }, { stage: 'contato' })
    await expect(run()).rejects.toMatchObject({ statusCode: 404 })
    expect(calls.some((c) => c.method === 'update')).toBe(false)
  })
})

describe('POST /api/admin/leads/[id]/events', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  test('tenant e autor saem da sessão, nunca do body', async () => {
    const fake = fakeSupabase({ lead_events: { data: [{ id: 'e1', lead_id: 'l1', kind: 'ligacao', body: 'oi', meta: {}, occurred_at: '', created_at: '', created_by: 'u1' }], error: null } })
    stubHandlerGlobals({
      requireTenantMember: async () => ({ client: fake.client, tenant: { id: 't1', slug: 'olmi' }, user: { id: 'u1' } }),
      readBody: async () => ({ kind: 'ligacao', body: 'oi', tenantId: 'outro', createdBy: 'alguem' }),
      assertLeadEventInput,
    })
    const handler = (await import('~~/server/api/admin/leads/[id]/events.post')).default as (e: unknown) => Promise<unknown>
    await handler({})
    const row = (fake.calls.find((c) => c.method === 'insert')!.args[0] as Record<string, unknown>[])[0]!
    expect(row).toMatchObject({ tenant_id: 't1', created_by: 'u1', kind: 'ligacao' })
  })

  test('lead de outro tenant: a FK composta recusa e vira 404', async () => {
    const fake = fakeSupabase({ lead_events: { data: null, error: { code: '23503', message: 'fk' } } })
    stubHandlerGlobals({
      requireTenantMember: async () => ({ client: fake.client, tenant: { id: 't1', slug: 'olmi' }, user: { id: 'u1' } }),
      readBody: async () => ({ kind: 'nota', body: 'x' }),
      assertLeadEventInput,
    })
    const handler = (await import('~~/server/api/admin/leads/[id]/events.post')).default as (e: unknown) => Promise<unknown>
    await expect(handler({})).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('tarefas', () => {
  const taskRow = {
    id: 'k1', tenant_id: 't1', lead_id: 'l1', property_id: null, broker_id: null, kind: 'visita', title: 'Visita',
    due_at: '', done_at: '2026-09-25', done_by: 'u1', canceled_at: null, created_at: '', created_by: null, updated_at: '',
    leads: null, properties: null,
  }

  test('concluir filtra por `done_at is null`: o banco decide a transição', async () => {
    const { client, calls } = fakeSupabase({ lead_tasks: { data: taskRow, error: null } })
    const r = await updateTask(client, 't1', 'k1', { done: true }, 'u1')
    expect(r?.concluiuAgora).toBe(true)
    expect(calls.some((c) => c.table === 'lead_tasks' && c.method === 'is' && c.args[0] === 'done_at')).toBe(true)
    expect(hadEq(calls, 'lead_tasks', 'tenant_id')).toBe(true)
  })

  test('segunda conclusão (duplo clique) não é transição — sem evento duplicado', async () => {
    // O update não acha linha (já concluída); a releitura devolve o estado real.
    const { client } = fakeSupabase({ lead_tasks: [{ data: null, error: null }, { data: taskRow, error: null }] })
    const r = await updateTask(client, 't1', 'k1', { done: true }, 'u1')
    expect(r?.concluiuAgora).toBe(false)
  })
})

describe('roleta e helpers', () => {
  test('corretorDoTenant filtra por tenant e recusa o que não achou', async () => {
    const { client, calls } = fakeSupabase({ brokers: { data: null, error: null } })
    await expect(corretorDoTenant(client, 't1', 'b-de-outro')).rejects.toMatchObject({ statusCode: 422 })
    expect(hadEq(calls, 'brokers', 'tenant_id')).toBe(true)
  })

  test('roleta escolhe no banco, atribui só dentro do tenant e registra "via roleta"', async () => {
    const { client, calls } = fakeSupabase(
      {
        leads: { data: null, error: null },
        brokers: { data: { id: 'b1', tenant_id: 't1', name: 'Ana', email: 'ana@x.com', phone: null, creci: null, active: true, photo_url: null, bio: null, public_visible: false, receives_leads: true, last_lead_at: null }, error: null },
        lead_events: { data: [], error: null },
      },
      { proximo_corretor_da_roleta: { data: 'b1', error: null } },
    )
    const r = await distribuirPelaRoleta(client, { id: 't1', slug: 'olmi' }, 'l1')
    expect(r).toEqual({ id: 'b1', name: 'Ana', email: 'ana@x.com' })
    expect(calls.find((c) => c.table === 'rpc:proximo_corretor_da_roleta')!.args[0]).toEqual({ p_tenant_id: 't1' })
    expect(hadEq(calls, 'leads', 'tenant_id')).toBe(true)
    const ev = (calls.find((c) => c.table === 'lead_events')!.args[0] as Record<string, unknown>[])[0]!
    expect(ev.meta).toEqual({ brokerId: 'b1', via: 'roleta' })
  })

  test('sem roleta (ou ninguém nela), o lead fica sem dono e nada é tocado', async () => {
    const { client, calls } = fakeSupabase({}, { proximo_corretor_da_roleta: { data: null, error: null } })
    expect(await distribuirPelaRoleta(client, { id: 't1', slug: 'olmi' }, 'l1')).toBeNull()
    expect(calls.some((c) => c.table === 'leads')).toBe(false)
  })

  test('roleta com erro não derruba o formulário do visitante', async () => {
    const { client } = fakeSupabase({}, { proximo_corretor_da_roleta: { data: null, error: { message: 'boom' } } })
    await expect(distribuirPelaRoleta(client, { id: 't1', slug: 'olmi' }, 'l1')).resolves.toBeNull()
  })

  test('evento de sistema que falha não vira erro para quem já salvou a mudança', async () => {
    const { client } = fakeSupabase({ lead_events: { data: null, error: { message: 'boom' } } })
    await expect(registrarEventos(client, { id: 't1', slug: 'olmi' }, 'l1', [{ kind: 'etapa', body: 'x', meta: {} }], 'u1')).resolves.toBeUndefined()
  })
})
