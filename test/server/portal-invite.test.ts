import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { Mensagem } from '~~/server/utils/mailer'

/**
 * O convite do portal — o arquivo mais sensível da Área do Cliente.
 *
 * A pergunta que esta suíte responde é uma só: **quando sai um token na caixa
 * de entrada de alguém?** Um link de definir senha é uma credencial, e ele sai
 * com o nome de exibição e o Reply-To da imobiliária, que ela mesma edita. Se a
 * regra afrouxar, o convite vira uma ferramenta de reset forçado e de phishing
 * com remetente autêntico contra qualquer endereço da plataforma — inclusive
 * contas de outras imobiliárias, que compartilham o mesmo `auth.users`.
 *
 * ⚠️ O caso que motivou o arquivo existir: até a revisão do PR #26 a decisão do
 * token olhava para a EXISTÊNCIA da linha em `portal_users`. Como a linha é
 * inserida também no caso 3 (conta preexistente de terceiro), bastava convidar
 * duas vezes — a primeira criava a linha, a segunda se julgava reenvio e
 * mandava o `recovery`. É o `deve recusar token na segunda chamada` abaixo.
 */

const enviados: Mensagem[] = []

vi.mock('~~/server/utils/mailer', () => ({
  enviarEmail: async (msg: Mensagem) => {
    enviados.push(msg)
    return { enviado: true, provedor: 'fake' }
  },
}))

const { fakeSupabaseWithAuth } = await import('../helpers/fake-supabase')
const { convidarClientePortal } = await import('~~/server/repositories/portal-invite.repository')

const TENANT = 't-olmi'
const NOME_IMOB = 'OLMI Imóveis'
const ENDERECO_REMETENTE = 'nao-responda@usemoradi.com.br'
const REDIRECT = 'https://olmi.com.br/area-cliente/definir-senha'
const PORTAL = 'https://olmi.com.br/area-cliente/login'
const REMETENTE = { nome: NOME_IMOB, endereco: ENDERECO_REMETENTE, replyTo: 'contato@olmi.com.br' }

const ENTRADA = { name: 'Giane', email: 'Giane@Exemplo.com', doc: null, phone: null }

/** Linha de `portal_users` como o banco devolve. */
function linha(over: Record<string, unknown> = {}) {
  return {
    id: 'pu-1',
    tenant_id: TENANT,
    user_id: 'u-1',
    name: 'Giane',
    email: 'giane@exemplo.com',
    doc: null,
    phone: null,
    active: true,
    access_confirmed_at: null,
    last_recovery_at: null,
    created_at: '2026-09-16T12:00:00.000Z',
    updated_at: '2026-09-16T12:00:00.000Z',
    ...over,
  }
}

function convidar(client: unknown) {
  return convidarClientePortal(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    client as any,
    TENANT,
    REMETENTE,
    ENTRADA,
    REDIRECT,
    PORTAL,
  )
}

/** Algum e-mail carregou um link de credencial? */
function levouToken(): boolean {
  return enviados.some((m) => /exemplo\/(convite|recovery)/.test(m.texto + m.html))
}

/** `generateLink` foi chamado com este tipo? */
function gerou(authCalls: { method: string; args: unknown[] }[], tipo: string): boolean {
  return authCalls.some(
    (c) => c.method === 'generateLink' && (c.args[0] as { type?: string })?.type === tipo,
  )
}

beforeEach(() => {
  enviados.length = 0
})

describe('caso 1 — a conta nasce agora', () => {
  test('manda o link de definir senha', async () => {
    const { client } = fakeSupabaseWithAuth({
      results: { portal_users: [{ data: null, error: null }, { data: linha(), error: null }] },
      users: [],
    })

    const r = await convidar(client)

    expect(r.jaEraCliente).toBe(false)
    expect(r.contaPreexistente).toBe(false)
    expect(r.semToken).toBe(false)
    expect(levouToken()).toBe(true)
  })

  test('grava o vínculo como confirmado — não há conta de terceiro para sequestrar', async () => {
    const { client, calls } = fakeSupabaseWithAuth({
      results: { portal_users: [{ data: null, error: null }, { data: linha(), error: null }] },
      users: [],
    })

    await convidar(client)

    const insert = calls.find((c) => c.table === 'portal_users' && c.method === 'insert')
    const row = insert?.args[0] as { access_confirmed_at: string | null }
    expect(row.access_confirmed_at).toBeTruthy()
  })
})

describe('caso 3 — o e-mail já tem conta na plataforma e não é cliente daqui', () => {
  test('avisa SEM token', async () => {
    const { client, authCalls } = fakeSupabaseWithAuth({
      results: { portal_users: [{ data: null, error: null }, { data: linha(), error: null }] },
      users: [{ id: 'u-de-outro-tenant', email: 'giane@exemplo.com' }],
    })

    const r = await convidar(client)

    expect(r.contaPreexistente).toBe(true)
    expect(r.semToken).toBe(true)
    expect(levouToken()).toBe(false)
    // O que não pode nem ser pedido ao GoTrue.
    expect(gerou(authCalls, 'recovery')).toBe(false)
  })

  test('a linha nasce SEM confirmação — é ela que barra a segunda chamada', async () => {
    const { client, calls } = fakeSupabaseWithAuth({
      results: { portal_users: [{ data: null, error: null }, { data: linha(), error: null }] },
      users: [{ id: 'u-de-outro-tenant', email: 'giane@exemplo.com' }],
    })

    await convidar(client)

    const insert = calls.find((c) => c.table === 'portal_users' && c.method === 'insert')
    const row = insert?.args[0] as { access_confirmed_at: string | null }
    expect(row.access_confirmed_at).toBeNull()
  })

  test('⚠️ convidar DUAS vezes não vira reenvio: a segunda chamada também sai sem token', async () => {
    // O caminho da escalada, ponta a ponta. A segunda chamada encontra a linha
    // que a primeira criou — e é exatamente por isso que "a linha existe" não
    // pode ser o critério.
    const { client, authCalls } = fakeSupabaseWithAuth({
      results: { portal_users: { data: linha({ access_confirmed_at: null }), error: null } },
      users: [{ id: 'u-de-outro-tenant', email: 'giane@exemplo.com' }],
    })

    const r = await convidar(client)

    expect(r.jaEraCliente).toBe(true)
    expect(r.semToken).toBe(true)
    expect(gerou(authCalls, 'recovery')).toBe(false)
    expect(levouToken()).toBe(false)
  })

  test('insistir dez vezes continua sem token', async () => {
    // Nenhuma das chamadas muda o estado que libera o token: só o login da
    // própria pessoa muda, e ele não passa por aqui.
    for (let i = 0; i < 10; i++) {
      const { client, authCalls } = fakeSupabaseWithAuth({
        results: { portal_users: { data: linha({ access_confirmed_at: null }), error: null } },
        users: [{ id: 'u-de-outro-tenant', email: 'giane@exemplo.com' }],
      })
      const r = await convidar(client)
      expect(r.semToken, `tentativa ${i + 1}`).toBe(true)
      expect(gerou(authCalls, 'recovery'), `tentativa ${i + 1}`).toBe(false)
    }
    expect(levouToken()).toBe(false)
  })
})

describe('caso 2 — reenvio para cliente confirmado', () => {
  test('manda o link de redefinição', async () => {
    const { client, authCalls } = fakeSupabaseWithAuth({
      results: {
        portal_users: {
          data: linha({ access_confirmed_at: '2026-09-10T10:00:00.000Z' }),
          error: null,
        },
      },
      users: [{ id: 'u-1', email: 'giane@exemplo.com' }],
    })

    const r = await convidar(client)

    expect(r.jaEraCliente).toBe(true)
    expect(r.semToken).toBe(false)
    expect(gerou(authCalls, 'recovery')).toBe(true)
    expect(levouToken()).toBe(true)
  })

  test('a confirmação é o ÚNICO campo que separa os dois destinos', async () => {
    // Mesmo cadastro, mesma conta, mesma chamada: só a coluna muda.
    for (const [confirmado, esperaToken] of [
      [null, false],
      ['2026-09-10T10:00:00.000Z', true],
    ] as const) {
      enviados.length = 0
      const { client } = fakeSupabaseWithAuth({
        results: { portal_users: { data: linha({ access_confirmed_at: confirmado }), error: null } },
        users: [{ id: 'u-1', email: 'giane@exemplo.com' }],
      })
      await convidar(client)
      expect(levouToken(), `confirmado=${confirmado}`).toBe(esperaToken)
    }
  })
})

describe('conta de equipe', () => {
  test('não vira cadastro de cliente por iniciativa de terceiro', async () => {
    const { client } = fakeSupabaseWithAuth({
      results: {
        portal_users: [{ data: null, error: null }],
        tenant_members: { data: { id: 'tm-1' }, error: null },
      },
      users: [{ id: 'u-admin', email: 'giane@exemplo.com' }],
    })

    await expect(convidar(client)).rejects.toMatchObject({ statusCode: 409 })
    expect(enviados).toHaveLength(0)
  })
})

describe('o e-mail em si', () => {
  test('sai com o nome da imobiliária e o Reply-To dela', async () => {
    const { client } = fakeSupabaseWithAuth({
      results: { portal_users: [{ data: null, error: null }, { data: linha(), error: null }] },
      users: [],
    })

    await convidar(client)

    expect(enviados[0]?.remetente).toEqual(REMETENTE)
    // Normalizado: o índice único do banco é sobre lower(email).
    expect(enviados[0]?.para).toBe('giane@exemplo.com')
  })
})
