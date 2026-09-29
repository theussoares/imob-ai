import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { lerLeadDoPortal, nomeParaSaudacao } from '~~/shared/models/portal-lead'
import { receberLeadDoPortal } from '~~/server/utils/portal-leads'
import type { Tenant } from '~~/shared/models/tenant'
import { fakeSupabase } from '../helpers/fake-supabase'
import { stripComments } from '../helpers/strip-comments'

/**
 * Leads do Canal Pro (0063).
 *
 * O webhook não tem assinatura (a spec do Grupo OLX não prevê): o token no
 * caminho é tudo o que diz de qual imobiliária é o lead. Ameaças: o corpo
 * decidir o tenant; o reenvio (até 3 vezes, reprocessamento por 14 dias)
 * virar card duplicado e aviso duplicado; a falha de gravação queimar o
 * reenvio que ia salvar o lead; e dado do portal que ninguém usa (e-mail,
 * CPF e renda do MCMV) acabar guardado.
 */

const LEAD = {
  leadOrigin: 'Grupo OLX',
  timestamp: '2026-09-29T15:50:30.619Z',
  originLeadId: '59ee0fc6e4b043e1b2a6d863',
  originListingId: '87027856',
  clientListingId: 'VD-0010',
  name: 'Ana Souza',
  email: 'ana@example.com',
  ddd: '67',
  phone: '991234567',
  message: 'Tenho interesse',
  temperature: 'Alta',
  transactionType: 'SELL',
  extraData: { leadType: 'CLICK_WHATSAPP', leadCerto: false },
}

describe('leitura do corpo', () => {
  test('o lead de anúncio, como o Grupo OLX manda', () => {
    const l = lerLeadDoPortal(LEAD)
    expect(l).toMatchObject({ originLeadId: LEAD.originLeadId, nome: 'Ana Souza', telefone: '67991234567', codigoDoImovel: 'VD-0010', tipo: 'busca_compra' })
    expect(typeof l !== 'string' && l.resumo).toBe('Chegou pelo portal (ZAP, Viva Real ou OLX) · clicou no WhatsApp · interesse alto')
  })

  test('e-mail e dados do MCMV não saem da leitura', () => {
    const l = lerLeadDoPortal({ ...LEAD, leadOrigin: 'MCMV_OLX', clientListingId: undefined, extraData: { mcmv: { sellerDocument: '12345678901' } } })
    expect(JSON.stringify(l)).not.toMatch(/ana@example|12345678901/)
  })

  test('anúncio sem código: recusa (a spec pede 4xx); MCMV sem código: aceita', () => {
    expect(lerLeadDoPortal({ ...LEAD, clientListingId: '' })).toBe('clientListingId ausente')
    expect(typeof lerLeadDoPortal({ ...LEAD, leadOrigin: 'MCMV_OLX', clientListingId: undefined })).toBe('object')
  })

  test('telefone pelo campo antigo, com DDI; inválido recusa', () => {
    expect(lerLeadDoPortal({ ...LEAD, ddd: '', phone: '', phoneNumber: '+55 (67) 99123-4567' })).toMatchObject({ telefone: '67991234567' })
    expect(lerLeadDoPortal({ ...LEAD, ddd: '', phone: '123' })).toBe('telefone inválido')
    expect(lerLeadDoPortal({})).toBe('originLeadId ausente')
  })
})

const TENANT = { id: 't1', slug: 'olmi', name: 'OLMI Imóveis' } as unknown as Tenant

describe('gravação', () => {
  const lido = () => {
    const l = lerLeadDoPortal(LEAD)
    if (typeof l === 'string') throw new Error(l)
    return l
  }

  test('reenvio (mesmo originLeadId): nada é gravado', async () => {
    const { client, calls } = fakeSupabase({ portal_lead_receipts: { data: null, error: { code: '23505' } } })
    await expect(receberLeadDoPortal(client, TENANT, lido(), { autoWhatsapp: false })).resolves.toBe('repetido')
    expect(calls.some((c) => c.table === 'leads')).toBe(false)
  })

  test('telefone com lead em aberto: anotação no histórico dele, sem card novo', async () => {
    const { client, calls } = fakeSupabase({
      portal_lead_receipts: [{ data: null, error: null }, { data: null, error: null }],
      properties: { data: [], error: null },
      leads: { data: [{ id: 'l9', broker_id: null }], error: null },
      lead_events: { data: [], error: null },
    })
    await expect(receberLeadDoPortal(client, TENANT, lido(), { autoWhatsapp: false })).resolves.toBe('atualizado')
    expect(calls.some((c) => c.table === 'leads' && c.method === 'insert')).toBe(false)
    const recibo = calls.find((c) => c.table === 'portal_lead_receipts' && c.method === 'update')
    expect(recibo?.args[0]).toEqual({ lead_id: 'l9' })
  })

  test('falha ao gravar solta a reserva — o reenvio do portal é a segunda chance', async () => {
    const { client, calls } = fakeSupabase({
      portal_lead_receipts: [{ data: null, error: null }, { data: null, error: null }],
      properties: { data: [], error: null },
      leads: [{ data: [], error: null }, { data: null, error: { message: 'banco fora' } }],
    })
    await expect(receberLeadDoPortal(client, TENANT, lido(), { autoWhatsapp: false })).rejects.toBeTruthy()
    expect(calls.some((c) => c.table === 'portal_lead_receipts' && c.method === 'delete')).toBe(true)
  })

  test('o lead novo não grava e-mail', () => {
    // A gravação passa por `createLead`, a mesma do formulário do site — as
    // colunas dela são as que o guardrail de privacidade vigia.
    const src = stripComments(readFileSync(join(process.cwd(), 'server/utils/portal-leads.ts'), 'utf8'))
    expect(src).toContain('createLead(service,')
    expect(src).not.toMatch(/email\s*:/)
  })
})

describe('URL vazada (achados da revisão)', () => {
  const src = stripComments(readFileSync(join(process.cwd(), 'server/api/webhooks/portais/leads/[token].post.ts'), 'utf8'))

  test('teto por hora ANTES de gravar, com 429 para o Canal Pro reenviar depois', () => {
    expect(src.indexOf('>= PORTAL_LEADS_POR_HORA')).toBeGreaterThan(0)
    expect(src.indexOf('>= PORTAL_LEADS_POR_HORA')).toBeLessThan(src.indexOf('receberLeadDoPortal('))
    expect(src).toContain('statusCode: 429')
  })

  test('teto diário do WhatsApp automático', () => {
    const util = stripComments(readFileSync(join(process.cwd(), 'server/utils/portal-leads.ts'), 'utf8'))
    expect(util.indexOf('>= PORTAL_WHATSAPP_AUTOMATICO_POR_DIA')).toBeLessThan(util.indexOf('iniciarConversaComModelo('))
  })

  test('nome que não é nome não entra no WhatsApp (um link viraria phishing com a cara da imobiliária)', () => {
    expect(nomeParaSaudacao('Ana Souza')).toBe('Ana')
    expect(nomeParaSaudacao('João')).toBe('João')
    expect(nomeParaSaudacao("D'Ávila")).toBe("D'Ávila")
    expect(nomeParaSaudacao('https://golpe.exemplo/pix')).toBe('cliente')
    expect(nomeParaSaudacao('www.golpe.com')).toBe('cliente')
    expect(nomeParaSaudacao('0800-123')).toBe('cliente')
    expect(nomeParaSaudacao('')).toBe('cliente')
  })

  test('a resposta não diz se o telefone já é cliente', () => {
    expect(src).toContain('return { ok: true }')
    expect(src).not.toMatch(/return \{ ok: true, resultado/)
  })

  test('lead gravado não solta a reserva (senão o reenvio pularia roleta e aviso)', async () => {
    const lido = lerLeadDoPortal(LEAD)
    if (typeof lido === 'string') throw new Error(lido)
    const { client, calls } = fakeSupabase({
      portal_lead_receipts: [{ data: null, error: null }, { data: null, error: { message: 'recibo fora' } }],
      properties: { data: [], error: null },
      leads: [{ data: [], error: null }, { data: { id: 'l1' }, error: null }],
      lead_events: { data: [], error: null },
      tenant_features: { data: null, error: null },
    })
    await receberLeadDoPortal(client, TENANT, lido, { autoWhatsapp: false }).catch(() => null)
    expect(calls.some((c) => c.table === 'portal_lead_receipts' && c.method === 'delete')).toBe(false)
  })
})

describe('webhook', () => {
  const src = stripComments(readFileSync(join(process.cwd(), 'server/api/webhooks/portais/leads/[token].post.ts'), 'utf8'))

  test('o tenant sai do token, nunca do corpo nem do Host', () => {
    expect(src).toContain('tenantByLeadsToken(service, token)')
    expect(src).not.toMatch(/useTenantContext|event\.context\.tenant|body\.tenant/)
  })

  test('sem o CRM ligado, a URL não existe', () => {
    expect(src).toContain('crmAtivo(tenant.id)')
  })

  test('token é conferido no formato antes de ir ao banco', () => {
    expect(src.indexOf('/^[A-Za-z0-9_-]{32,64}$/')).toBeLessThan(src.indexOf('tenantByLeadsToken('))
  })
})
