import { afterEach, describe, expect, test } from 'vitest'
import type { Tenant } from '~~/shared/models/tenant'
import { destinatariosDoAviso, listarLeadsParados } from '~~/server/repositories/lead-alert.repository'
import { emailLeadsParados, emailNovoLead, linkWhatsappDoLead } from '~~/server/utils/email-templates'
import { avisarNovoLead, janelaDoLembrete } from '~~/server/utils/lead-alert'
import { mesmoSegredo } from '~~/server/utils/segredo'
import { fakeSupabase, fakeSupabaseWithAuth, hadEq } from '../helpers/fake-supabase'

/**
 * Aviso de lead para a imobiliária.
 *
 * O incidente: lead da OLMI em 09/09/2026 sem retorno, porque o formulário
 * gravava e não avisava ninguém. As ameaças que estes testes cobrem são as do
 * conserto — o aviso ir para a imobiliária errada, carregar HTML de terceiro,
 * ou derrubar o formulário do visitante quando o e-mail falha.
 */

const TENANT = { id: 't1', slug: 'olmi', name: 'OLMI IMÓVEIS', email: 'contato@olmi.com.br' } as Tenant

const LEAD = {
  nome: 'Maria Souza',
  telefone: '67991234567',
  mensagem: 'Ainda disponível?',
  tipo: 'Quer comprar',
  imovel: { codigo: 'VD-0010', titulo: 'Casa no Centro' },
}

describe('destinatariosDoAviso', () => {
  test('filtra os membros pelo tenant — service role não tem RLS para ajudar', async () => {
    const { client, calls } = fakeSupabaseWithAuth({
      results: { tenant_members: { data: [{ user_id: 'u1' }], error: null } },
      users: [{ id: 'u1', email: 'dono@olmi.com.br', email_confirmed_at: '2026-01-01' }],
    })
    await destinatariosDoAviso(client, TENANT)
    // Sem este filtro, o aviso da OLMI iria para todo membro de toda
    // imobiliária — nome e telefone do lead na caixa de um concorrente.
    expect(hadEq(calls, 'tenant_members', 'tenant_id')).toBe(true)
    expect(calls.find((c) => c.method === 'eq' && c.args[0] === 'tenant_id')?.args[1]).toBe('t1')
  })

  test('convite pendente não recebe: ninguém provou ser dono do endereço', async () => {
    const { client } = fakeSupabaseWithAuth({
      results: { tenant_members: { data: [{ user_id: 'u1' }, { user_id: 'u2' }], error: null } },
      users: [
        { id: 'u1', email: 'dono@olmi.com.br', email_confirmed_at: '2026-01-01' },
        { id: 'u2', email: 'digitado-errado@olmi.com.br', email_confirmed_at: null },
      ],
    })
    const para = await destinatariosDoAviso(client, { ...TENANT, email: null })
    expect(para).toEqual(['dono@olmi.com.br'])
  })

  test('soma o e-mail de contato da imobiliária e não repete endereço', async () => {
    // Sem o tenant.email, uma imobiliária cujo único membro é da plataforma
    // ficaria sem aviso — exatamente o caso de cliente recém-implantado.
    const { client } = fakeSupabaseWithAuth({
      results: { tenant_members: { data: [{ user_id: 'u1' }], error: null } },
      users: [{ id: 'u1', email: 'Contato@OLMI.com.br', email_confirmed_at: '2026-01-01' }],
    })
    expect(await destinatariosDoAviso(client, TENANT)).toEqual(['contato@olmi.com.br'])
  })

  test('usuário removido do Auth não quebra o aviso dos outros', async () => {
    const { client } = fakeSupabaseWithAuth({
      results: { tenant_members: { data: [{ user_id: 'sumiu' }], error: null } },
      users: [],
    })
    expect(await destinatariosDoAviso(client, TENANT)).toEqual(['contato@olmi.com.br'])
  })
})

describe('listarLeadsParados', () => {
  const linha = (over: Record<string, unknown> = {}) => ({
    tenant_id: 't1',
    name: 'Maria',
    phone: '67991234567',
    message: null,
    lead_type: 'busca_compra',
    source: 'property_page',
    created_at: '2026-09-23T12:00:00Z',
    updated_at: '2026-09-23T12:00:00Z',
    properties: { code: 'v.d- 0010', title: 'Casa' },
    ...over,
  })

  test('só etapa novo, dentro da janela', async () => {
    const { client, calls } = fakeSupabase({ leads: { data: [], error: null } })
    await listarLeadsParados(client, { recebidoDesde: 'A', paradoAntesDe: 'B' })
    const eqStage = calls.find((c) => c.method === 'eq' && c.args[0] === 'stage')
    expect(eqStage?.args[1]).toBe('novo')
    // `updated_at`, não `created_at`: anotar no lead já conta como atendimento.
    expect(calls.some((c) => c.method === 'lt' && c.args[0] === 'updated_at' && c.args[1] === 'B')).toBe(true)
    expect(calls.some((c) => c.method === 'gte' && c.args[0] === 'created_at' && c.args[1] === 'A')).toBe(true)
  })

  test('não usa select(*): nada de coluna interna viajando para um e-mail', async () => {
    const { client, calls } = fakeSupabase({ leads: { data: [], error: null } })
    await listarLeadsParados(client, { recebidoDesde: 'A', paradoAntesDe: 'B' })
    const sel = String(calls.find((c) => c.method === 'select')?.args[0])
    expect(sel).not.toContain('*')
    expect(sel).not.toContain('ip_hash')
  })

  test('cadastro manual fica fora — quem cadastrou já está falando com a pessoa', async () => {
    const { client } = fakeSupabase({
      leads: { data: [linha(), linha({ source: 'manual', name: 'Manual' })], error: null },
    })
    const r = await listarLeadsParados(client, { recebidoDesde: 'A', paradoAntesDe: 'B' })
    expect(r.map((l) => l.nome)).toEqual(['Maria'])
  })

  test('mantém o tenant de cada linha e normaliza o código do imóvel', async () => {
    const { client } = fakeSupabase({ leads: { data: [linha({ tenant_id: 't2' })], error: null } })
    const [l] = await listarLeadsParados(client, { recebidoDesde: 'A', paradoAntesDe: 'B' })
    // É a única leitura cross-tenant da base: perder o tenantId aqui mandaria
    // o lembrete de uma imobiliária para outra.
    expect(l!.tenantId).toBe('t2')
    expect(l!.imovel?.codigo).toBe('VD-0010')
    expect(l!.tipo).toBe('Quer comprar')
  })
})

describe('janelaDoLembrete', () => {
  test('parado há 20h (não 24h) e recebido nos últimos 7 dias', () => {
    // 20h porque o cron roda uma vez por dia: com 24h, o lead das 9h05 de
    // ontem escaparia por minutos e esperaria mais um dia.
    const agora = new Date('2026-09-25T12:00:00Z')
    expect(janelaDoLembrete(agora)).toEqual({
      recebidoDesde: '2026-09-18T12:00:00.000Z',
      paradoAntesDe: '2026-09-24T16:00:00.000Z',
    })
  })
})

describe('templates do aviso', () => {
  test('link de WhatsApp leva o DDI 55 — sem ele o wa.me abre número de outro país', () => {
    const link = linkWhatsappDoLead(LEAD, 'OLMI')
    expect(link.startsWith('https://wa.me/5567991234567?text=')).toBe(true)
    expect(decodeURIComponent(link.split('text=')[1]!)).toContain('VD-0010')
  })

  test('nome e mensagem do visitante são escapados no HTML', () => {
    // Formulário público: quem escreve é qualquer um, e o HTML vai para a
    // caixa de entrada da imobiliária.
    const malicioso = { ...LEAD, nome: '<img src=x onerror=alert(1)>', mensagem: '<script>x</script>' }
    const { html } = emailNovoLead({ nomeImobiliaria: 'OLMI', lead: malicioso, urlPainel: null })
    expect(html).not.toContain('<img src=x')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  test('assunto diz quem e sobre o quê — é o que aparece na notificação do celular', () => {
    const { assunto, texto } = emailNovoLead({ nomeImobiliaria: 'OLMI', lead: LEAD, urlPainel: 'https://painel.olmi.com.br/admin/leads' })
    expect(assunto).toBe('Novo lead: Maria Souza · VD-0010')
    expect(texto).toContain('(67) 99123-4567')
    expect(texto).toContain('https://painel.olmi.com.br/admin/leads')
  })

  test('lembrete conta os leads no assunto', () => {
    const leads = [{ ...LEAD, recebidoEm: '23/09 às 09:00' }, { ...LEAD, nome: 'João', recebidoEm: '24/09 às 10:00' }]
    const { assunto, texto } = emailLeadsParados({ nomeImobiliaria: 'OLMI', leads, urlPainel: null })
    expect(assunto).toBe('OLMI · 2 leads ainda sem resposta')
    expect(texto).toContain('João')
  })
})

describe('avisarNovoLead', () => {
  const original = (globalThis as Record<string, unknown>).serviceSupabase
  afterEach(() => {
    Object.assign(globalThis, { serviceSupabase: original })
  })

  test('falha no banco não lança — o lead já foi gravado e o visitante não pode ver erro', async () => {
    // Se isto lançasse, o POST devolveria 500 e o visitante tentaria de novo
    // (duplicando o lead) ou desistiria de um contato que na verdade chegou.
    Object.assign(globalThis, {
      serviceSupabase: () => fakeSupabase({ tenant_members: { data: null, error: { message: 'fora do ar' } } }).client,
    })
    await expect(avisarNovoLead(TENANT, LEAD)).resolves.toBeUndefined()
  })

  test('serviceSupabase lançando também não lança', async () => {
    Object.assign(globalThis, {
      serviceSupabase: () => {
        throw new Error('sem chave')
      },
    })
    await expect(avisarNovoLead(TENANT, LEAD)).resolves.toBeUndefined()
  })
})

describe('mesmoSegredo (cron)', () => {
  test('aceita o igual, recusa o diferente e o de tamanho diferente', () => {
    // A rota do cron sem esta conferência seria um botão público de "dispare
    // e-mail para todas as imobiliárias".
    expect(mesmoSegredo('Bearer abc', 'Bearer abc')).toBe(true)
    expect(mesmoSegredo('Bearer abd', 'Bearer abc')).toBe(false)
    expect(mesmoSegredo('', 'Bearer abc')).toBe(false)
  })
})

describe('PII fora do log do mailer', () => {
  test('falha de envio registra o rótulo, não o assunto com o nome do lead', async () => {
    // O assunto "Novo lead: Maria Souza" é o que faz o aviso ser lido na
    // notificação. Com o provedor fora do ar, sem o rótulo, cada lead viraria
    // uma linha de log com o nome do visitante — retida no painel da Vercel.
    const { enviarEmail } = await import('~~/server/utils/mailer')
    const eventos: Record<string, unknown>[] = []
    const antes = { env: process.env.NODE_ENV, logError: (globalThis as Record<string, unknown>).logError }
    Object.assign(globalThis, { logError: (_: string, d: Record<string, unknown>) => eventos.push(d) })
    process.env.NODE_ENV = 'production'
    try {
      const corpo = emailNovoLead({ nomeImobiliaria: 'OLMI', lead: LEAD, urlPainel: null })
      await expect(
        enviarEmail({
          para: 'dono@olmi.com.br',
          ...corpo,
          remetente: { nome: 'Moradi', endereco: '', replyTo: null },
          rotuloDeLog: 'lead.novo',
        }),
      ).rejects.toThrow()
    } finally {
      process.env.NODE_ENV = antes.env
      Object.assign(globalThis, { logError: antes.logError })
    }
    expect(JSON.stringify(eventos)).not.toContain('Maria')
    expect(eventos[0]?.assunto).toBe('lead.novo')
  })
})
