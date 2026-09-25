import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { whatsappTargetForCode } from '~~/server/repositories/property.repository'
import {
  MAX_CLIQUES_POR_IP,
  getClickForConversion,
  listRecentWhatsappClicks,
  recordWhatsappClick,
} from '~~/server/repositories/whatsapp-click.repository'
import { assertLeadCreateInput } from '~~/server/utils/validate'
import { toWhatsappClickOrigin } from '~~/shared/models/whatsapp-click'
import { fakeSupabase, hadEq, touched } from '../helpers/fake-supabase'

/**
 * Clique no WhatsApp registrado para o painel.
 *
 * O endpoint que grava é público — a anon key e a URL estão em todo HTML. As
 * ameaças: o visitante escrever a métrica que o cliente vê (destino, origem),
 * gravar clique na imobiliária de outro, inflar a lista com script, e o
 * cadastro manual virar porta para gravar imóvel de outro tenant num lead.
 */

const ARGS = { tenantId: 't1', propertyId: 'p1', brokerId: null, origin: 'card' as const, ipHash: 'h1' }

describe('recordWhatsappClick', () => {
  test('grava com tenant e destino calculado a partir do corretor', async () => {
    const { client, calls } = fakeSupabase({
      whatsapp_clicks: [
        { data: null, error: null, count: 0 },
        { data: null, error: null, count: 0 },
        { data: null, error: null },
      ],
    })
    expect(await recordWhatsappClick(client, { ...ARGS, brokerId: 'b1' })).toBe('gravado')
    const insert = calls.find((c) => c.method === 'insert')?.args[0] as Record<string, unknown>
    expect(insert.tenant_id).toBe('t1')
    expect(insert.destination).toBe('corretor')
    // As duas contagens também filtram por tenant: service role, sem RLS.
    expect(calls.filter((c) => c.method === 'eq' && c.args[0] === 'tenant_id').length).toBe(2)
  })

  test('sem corretor, a conversa foi para a imobiliária', async () => {
    const { client, calls } = fakeSupabase({
      whatsapp_clicks: [{ data: null, error: null, count: 0 }, { data: null, error: null, count: 0 }, { data: null, error: null }],
    })
    await recordWhatsappClick(client, ARGS)
    expect((calls.find((c) => c.method === 'insert')?.args[0] as Record<string, unknown>).destination).toBe('imobiliaria')
  })

  test('toque repetido no mesmo imóvel não vira segundo clique', async () => {
    const { client, calls } = fakeSupabase({
      whatsapp_clicks: [{ data: null, error: null, count: 0 }, { data: null, error: null, count: 1 }],
    })
    expect(await recordWhatsappClick(client, ARGS)).toBe('repetido')
    expect(calls.some((c) => c.method === 'insert')).toBe(false)
  })

  test('enxurrada do mesmo IP é descartada', async () => {
    const { client, calls } = fakeSupabase({
      whatsapp_clicks: [{ data: null, error: null, count: MAX_CLIQUES_POR_IP }],
    })
    expect(await recordWhatsappClick(client, ARGS)).toBe('excesso')
    expect(calls.some((c) => c.method === 'insert')).toBe(false)
  })

  test('sem IP identificável, grava sem deduplicar — o clique é o dado', async () => {
    const { client, calls } = fakeSupabase({ whatsapp_clicks: { data: null, error: null } })
    expect(await recordWhatsappClick(client, { ...ARGS, ipHash: null })).toBe('gravado')
    expect(calls.filter((c) => c.method === 'select').length).toBe(0)
  })

  test('contagem que falha não impede de gravar', async () => {
    const { client } = fakeSupabase({
      whatsapp_clicks: [
        { data: null, error: { message: 'timeout' } },
        { data: null, error: { message: 'timeout' } },
        { data: null, error: null },
      ],
    })
    expect(await recordWhatsappClick(client, ARGS)).toBe('gravado')
  })
})

describe('whatsappTargetForCode', () => {
  const broker = (over: Record<string, unknown>) => ({
    id: 'b1', tenant_id: 't1', name: 'Ana', phone: '5567999990000', active: true,
    bio: null, creci: null, email: null, photo_url: null, public_visible: true,
    created_at: '', updated_at: '', ...over,
  })

  test('só imóvel ativo deste tenant', async () => {
    const { client, calls } = fakeSupabase({ properties: { data: [], error: null } })
    expect(await whatsappTargetForCode(client, 't1', 'VD-0010')).toBeNull()
    expect(calls.find((c) => c.method === 'eq' && c.args[0] === 'tenant_id')?.args[1]).toBe('t1')
    expect(calls.find((c) => c.method === 'eq' && c.args[0] === 'status')?.args[1]).toBe('active')
  })

  test('corretor ativo com telefone: a conversa foi para ele', async () => {
    const { client } = fakeSupabase({
      properties: { data: [{ id: 'p1', broker_id: 'b1' }], error: null },
      brokers: { data: [broker({})], error: null },
    })
    expect(await whatsappTargetForCode(client, 't1', 'VD-0010')).toEqual({ propertyId: 'p1', brokerId: 'b1' })
  })

  test('corretor inativo: o site manda para a imobiliária, e o painel tem que dizer o mesmo', async () => {
    // Mesma regra de `publicBrokerPhone`. Se divergissem, o painel diria "foi
    // para o corretor" sobre uma conversa que caiu no número da imobiliária.
    const { client } = fakeSupabase({
      properties: { data: [{ id: 'p1', broker_id: 'b1' }], error: null },
      brokers: { data: [broker({ active: false })], error: null },
    })
    expect(await whatsappTargetForCode(client, 't1', 'VD-0010')).toEqual({ propertyId: 'p1', brokerId: null })
  })
})

describe('listRecentWhatsappClicks', () => {
  test('filtra por tenant e não traz ip_hash', async () => {
    const { client, calls } = fakeSupabase({ whatsapp_clicks: { data: [], error: null } })
    await listRecentWhatsappClicks(client, 't1', '2026-09-18T00:00:00Z')
    expect(hadEq(calls, 'whatsapp_clicks', 'tenant_id')).toBe(true)
    const sel = String(calls.find((c) => c.method === 'select')?.args[0])
    expect(sel).not.toContain('ip_hash')
    expect(sel).not.toContain('*')
  })
})

describe('origem do clique', () => {
  test('valor fora da lista cai em site — o body é do visitante', () => {
    expect(toWhatsappClickOrigin('card')).toBe('card')
    expect(toWhatsappClickOrigin('<script>')).toBe('site')
    expect(toWhatsappClickOrigin(undefined)).toBe('site')
  })
})

/**
 * Handlers, com os auto-imports do Nuxt no lugar. `defineEventHandler` vira a
 * identidade, e o resto é stub por teste.
 */
function stubHandlerGlobals(extra: Record<string, unknown>) {
  vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
  vi.stubGlobal('setResponseStatus', () => {})
  vi.stubGlobal('logWarn', () => {})
  vi.stubGlobal('logError', () => {})
  for (const [k, v] of Object.entries(extra)) vi.stubGlobal(k, v)
}

describe('POST /api/whatsapp-clicks', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  test('sem tenant (landing da plataforma), não grava nada', async () => {
    const { client, calls } = fakeSupabase({})
    stubHandlerGlobals({ serviceSupabase: () => client, readBody: async () => ({}), requestIpHash: () => null })
    const handler = (await import('~~/server/api/whatsapp-clicks.post')).default as (e: unknown) => Promise<unknown>
    await handler({ context: {} })
    expect(touched(calls, 'whatsapp_clicks')).toBe(false)
  })

  test('destino vindo do body é ignorado; o tenant é o do host', async () => {
    const { client, calls } = fakeSupabase({ whatsapp_clicks: { data: null, error: null } })
    stubHandlerGlobals({
      serviceSupabase: () => client,
      readBody: async () => ({ origin: 'card', destination: 'corretor', tenantId: 'outro' }),
      requestIpHash: () => null,
    })
    const handler = (await import('~~/server/api/whatsapp-clicks.post')).default as (e: unknown) => Promise<unknown>
    await handler({ context: { tenant: { id: 't1', slug: 'olmi' } } })
    const insert = calls.find((c) => c.method === 'insert')?.args[0] as Record<string, unknown>
    expect(insert.tenant_id).toBe('t1')
    expect(insert.destination).toBe('imobiliaria')
  })

  test('erro no banco não vira erro para o visitante', async () => {
    stubHandlerGlobals({
      serviceSupabase: () => {
        throw new Error('sem chave')
      },
      readBody: async () => ({ propertyCode: 'VD-0010' }),
      requestIpHash: () => null,
    })
    const handler = (await import('~~/server/api/whatsapp-clicks.post')).default as (e: unknown) => Promise<unknown>
    await expect(handler({ context: { tenant: { id: 't1', slug: 'olmi' } } })).resolves.toBeNull()
  })
})

describe('POST /api/admin/leads a partir de um clique', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  const CLICK_ID = '3f0c1f8e-5d7a-4b8e-9a51-2f6d0c7e9b11'
  const leadRow = {
    id: 'l1', tenant_id: 't1', property_id: 'p1', name: 'Maria', phone: null, message: null,
    source: 'manual', lead_type: 'busca_compra', stage: 'novo', notes: null, next_contact_at: null,
    broker_id: null, created_at: '', updated_at: '', updated_by: null, ip_hash: null, properties: null,
  }

  async function handlerCom(results: Parameters<typeof fakeSupabase>[0], body: Record<string, unknown>) {
    const fake = fakeSupabase(results)
    stubHandlerGlobals({
      requireTenantMember: async () => ({ client: fake.client, tenant: { id: 't1', slug: 'olmi' } }),
      readBody: async () => body,
      assertLeadCreateInput,
    })
    const handler = (await import('~~/server/api/admin/leads.post')).default as (e: unknown) => Promise<unknown>
    return { run: () => handler({}), calls: fake.calls }
  }

  test('o imóvel sai do clique, nunca do body', async () => {
    const { run, calls } = await handlerCom(
      {
        whatsapp_clicks: [{ data: { property_id: 'p1', broker_id: null, lead_id: null }, error: null }, { data: [{ id: 'c1' }], error: null }],
        leads: { data: leadRow, error: null },
      },
      // `propertyId` no body é a tentativa de gravar imóvel de outro tenant.
      { name: 'Maria', whatsappClickId: CLICK_ID, propertyId: 'imovel-de-outro-tenant' },
    )
    await run()
    const insert = calls.find((c) => c.table === 'leads' && c.method === 'insert')?.args[0] as Record<string, unknown>
    expect(insert.property_id).toBe('p1')
    // O clique foi lido com filtro de tenant, e marcado como convertido.
    expect(hadEq(calls, 'whatsapp_clicks', 'tenant_id')).toBe(true)
    const update = calls.find((c) => c.table === 'whatsapp_clicks' && c.method === 'update')?.args[0]
    expect(update).toEqual({ lead_id: 'l1' })
  })

  test('sem clique, `propertyId` do body não chega ao banco', async () => {
    const { run, calls } = await handlerCom(
      { leads: { data: leadRow, error: null } },
      { name: 'Maria', propertyId: 'imovel-de-outro-tenant' },
    )
    await run()
    const insert = calls.find((c) => c.table === 'leads' && c.method === 'insert')?.args[0] as Record<string, unknown>
    expect(insert.property_id).toBeNull()
  })

  test('clique de outro tenant (ou inexistente) é 404, e nada é criado', async () => {
    const { run, calls } = await handlerCom(
      { whatsapp_clicks: { data: null, error: null } },
      { name: 'Maria', whatsappClickId: CLICK_ID },
    )
    await expect(run()).rejects.toMatchObject({ statusCode: 404 })
    expect(touched(calls, 'leads')).toBe(false)
  })

  test('clique já convertido é 409 — dois atendentes, um contato', async () => {
    const { run, calls } = await handlerCom(
      { whatsapp_clicks: { data: { property_id: 'p1', broker_id: null, lead_id: 'l0' }, error: null } },
      { name: 'Maria', whatsappClickId: CLICK_ID },
    )
    await expect(run()).rejects.toMatchObject({ statusCode: 409 })
    expect(touched(calls, 'leads')).toBe(false)
  })

  test('dois atendentes no mesmo clique: quem perde a corrida tem o contato desfeito', async () => {
    // Os dois passam pela checagem de `lead_id` antes do insert; quem decide é
    // o update condicional. O segundo recebe 0 linhas, e o contato dele some
    // em vez de ficar duplicado no quadro.
    const { run, calls } = await handlerCom(
      {
        whatsapp_clicks: [{ data: { property_id: 'p1', broker_id: null, lead_id: null }, error: null }, { data: [], error: null }],
        leads: [{ data: leadRow, error: null }, { data: null, error: null }],
      },
      { name: 'Maria', whatsappClickId: CLICK_ID },
    )
    await expect(run()).rejects.toMatchObject({ statusCode: 409 })
    expect(calls.some((c) => c.table === 'whatsapp_clicks' && c.method === 'is' && c.args[0] === 'lead_id')).toBe(true)
    expect(calls.some((c) => c.table === 'leads' && c.method === 'delete')).toBe(true)
  })

  test('id que não é uuid é recusado antes de ir ao banco', async () => {
    const { run, calls } = await handlerCom({}, { name: 'Maria', whatsappClickId: "1' or '1'='1" })
    await expect(run()).rejects.toMatchObject({ statusCode: 422 })
    expect(touched(calls, 'whatsapp_clicks')).toBe(false)
  })
})

describe('getClickForConversion', () => {
  test('filtra por tenant além do id', async () => {
    const { client, calls } = fakeSupabase({ whatsapp_clicks: { data: null, error: null } })
    await getClickForConversion(client, 't1', 'c1')
    expect(calls.find((c) => c.method === 'eq' && c.args[0] === 'tenant_id')?.args[1]).toBe('t1')
  })
})

describe('migration 0046', () => {
  // Sem os comentários `--`: o cabeçalho explica o porquê citando "insert" e
  // "policy", e o teste tem que olhar só para o SQL que roda.
  const sql = readFileSync(join(process.cwd(), 'supabase/migrations/0046_whatsapp_clicks.sql'), 'utf8')
    .replace(/--.*$/gm, '')
    .toLowerCase()

  test('RLS ligada e anon sem grant — a anon key está em todo HTML', () => {
    // Com o GRANT default do Supabase, o visitante gravaria direto no banco e
    // pularia deduplicação e validação do endpoint (o problema da 0015).
    expect(sql).toContain('alter table public.whatsapp_clicks enable row level security')
    expect(sql).toContain('revoke all on public.whatsapp_clicks from anon')
  })

  test('nenhuma policy de insert: quem grava é só o servidor', () => {
    expect(sql).not.toMatch(/for\s+insert/)
    expect(sql).not.toMatch(/for\s+all/)
  })

  test('membro só atualiza lead_id — revoke antes do grant por coluna', () => {
    // Sem o grant por coluna, o membro reescreveria `property_id` pela API
    // REST antes de converter, e o imóvel de outro tenant entraria no lead.
    const revoke = sql.indexOf('revoke update on public.whatsapp_clicks from authenticated')
    const grant = sql.indexOf('grant update (lead_id) on public.whatsapp_clicks to authenticated')
    expect(revoke).toBeGreaterThan(-1)
    expect(grant).toBeGreaterThan(revoke)
  })

  test('update amarra o lead ao mesmo tenant do clique', () => {
    expect(sql).toMatch(/l\.tenant_id\s*=\s*whatsapp_clicks\.tenant_id/)
  })
})
