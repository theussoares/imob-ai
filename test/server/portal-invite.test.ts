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

/**
 * Como o envio se comporta no teste da vez.
 *
 * `null` = envia. Um número = o `mailer` lança com aquele `statusCode`, que é
 * como ele separa "não configurado" (500) de "o provedor recusou" (502).
 * `'simulado'` = devolve `enviado: false` sem lançar, que é o caminho de fora
 * de produção.
 */
let comportamentoDoEnvio: null | number | 'simulado' = null

vi.mock('~~/server/utils/mailer', () => ({
  enviarEmail: async (msg: Mensagem) => {
    if (typeof comportamentoDoEnvio === 'number') {
      throw Object.assign(new Error('falha de envio'), { statusCode: comportamentoDoEnvio })
    }
    if (comportamentoDoEnvio === 'simulado') return { enviado: false, provedor: 'log' }
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
  comportamentoDoEnvio = null
})

/**
 * Por que o e-mail não saiu — a informação que a tela não tinha.
 *
 * ⚠️ Nasceu de um caso real no preview: o convite não saía e a única frase
 * possível era "tente de novo em instantes". Quem clicou tentou três vezes,
 * ganhou três toasts idênticos, e a causa (chave de API ausente) não aparecia em
 * lugar nenhum da tela. "Tente de novo" é MENTIRA quando falta configuração: não
 * existe número de tentativas que resolva.
 */
describe('a tela fica sabendo por que o envio falhou', () => {
  function semRegistro() {
    return fakeSupabaseWithAuth({
      results: { portal_users: [{ data: null, error: null }, { data: linha(), error: null }] },
      users: [],
    })
  }

  test('envio bem-sucedido não tem motivo de falha', async () => {
    const r = await convidar(semRegistro().client)
    expect(r.emailEnviado).toBe(true)
    expect(r.motivoFalha).toBe(null)
  })

  test('500 do mailer é falta de configuração — não adianta tentar de novo', async () => {
    comportamentoDoEnvio = 500
    const r = await convidar(semRegistro().client)
    expect(r.emailEnviado).toBe(false)
    expect(r.motivoFalha).toBe('nao_configurado')
  })

  test('502 é o provedor recusando — aí tentar de novo faz sentido', async () => {
    comportamentoDoEnvio = 502
    const r = await convidar(semRegistro().client)
    expect(r.emailEnviado).toBe(false)
    expect(r.motivoFalha).toBe('provedor')
  })

  test('erro sem status conhecido erra para o lado de "tente de novo"', async () => {
    // Afirmar "é problema nosso" sobre um erro que não conhecemos é pior que
    // sugerir uma tentativa a mais.
    comportamentoDoEnvio = 418
    const r = await convidar(semRegistro().client)
    expect(r.motivoFalha).toBe('provedor')
  })

  test('`enviado: false` sem exceção também é falta de configuração', async () => {
    // É o caminho de fora de produção, e ele sai do MESMO ramo de "sem chave ou
    // sem remetente" que o 500 sinaliza — a causa é a mesma.
    comportamentoDoEnvio = 'simulado'
    const r = await convidar(semRegistro().client)
    expect(r.emailEnviado).toBe(false)
    expect(r.motivoFalha).toBe('nao_configurado')
  })

  test('o cadastro NÃO é desfeito quando o e-mail falha', async () => {
    // A regra que já existia e que estes casos novos não podem ter quebrado: o
    // vínculo recém-criado sobrevive, e o reenvio resolve.
    comportamentoDoEnvio = 500
    const r = await convidar(semRegistro().client)
    expect(r.cliente.id).toBe('pu-1')
  })
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

/**
 * Cliente cadastrado SEM acesso (0050) ganhando acesso. A mesma pergunta da
 * suíte — quando sai um token? — para o caminho novo: a linha já existe, mas
 * sem conta. Ela NÃO pode ser tratada como reenvio (que é o que "a linha
 * existe" diria), senão o caso 3 voltaria pela porta dos fundos.
 */
describe('cliente sem acesso ganhando acesso', () => {
  const semAcesso = () => linha({ user_id: null, access_confirmed_at: null })

  test('conta nasce agora: liga a conta à MESMA linha, confirmada, com link de senha', async () => {
    const { client, calls } = fakeSupabaseWithAuth({
      results: {
        portal_users: [{ data: semAcesso(), error: null }, { data: linha({ user_id: 'novo-user' }), error: null }],
        tenant_members: { data: null, error: null },
      },
      users: [],
    })

    const r = await convidar(client)

    const update = calls.find((c) => c.table === 'portal_users' && c.method === 'update')!.args[0] as Record<string, unknown>
    expect(update.user_id).toBe('novo-user')
    expect(update.access_confirmed_at).not.toBeNull()
    // Trava contra duas abas: só liga se ainda estiver sem conta.
    expect(calls.some((c) => c.table === 'portal_users' && c.method === 'is' && c.args[0] === 'user_id')).toBe(true)
    // Nada de insert: é a mesma pessoa, não um cadastro novo.
    expect(calls.some((c) => c.table === 'portal_users' && c.method === 'insert')).toBe(false)
    expect(r.jaEraCliente).toBe(false)
    expect(levouToken()).toBe(true)
  })

  test('⚠️ e-mail com conta de terceiro: liga SEM confirmação e avisa SEM token', async () => {
    const { client, calls, authCalls } = fakeSupabaseWithAuth({
      results: {
        portal_users: [{ data: semAcesso(), error: null }, { data: linha({ user_id: 'u-de-outro-tenant' }), error: null }],
        tenant_members: { data: null, error: null },
      },
      users: [{ id: 'u-de-outro-tenant', email: 'giane@exemplo.com' }],
    })

    const r = await convidar(client)

    const update = calls.find((c) => c.table === 'portal_users' && c.method === 'update')!.args[0] as Record<string, unknown>
    expect(update.access_confirmed_at).toBeNull()
    expect(r.semToken).toBe(true)
    expect(gerou(authCalls, 'recovery')).toBe(false)
    expect(levouToken()).toBe(false)
  })

  test('e-mail de conta de equipe é recusado também aqui — vínculo novo é vínculo novo', async () => {
    const { client, calls } = fakeSupabaseWithAuth({
      results: {
        portal_users: [{ data: semAcesso(), error: null }],
        tenant_members: { data: { id: 'm-1' }, error: null },
      },
      users: [{ id: 'u-operador', email: 'giane@exemplo.com' }],
    })

    await expect(convidar(client)).rejects.toMatchObject({ statusCode: 409 })
    expect(calls.some((c) => c.table === 'portal_users' && c.method === 'update')).toBe(false)
  })

  test('sem e-mail não há acesso: recusado antes de qualquer chamada ao Auth', async () => {
    const { client, authCalls } = fakeSupabaseWithAuth({ results: {}, users: [] })
    await expect(
      convidarClientePortal(client, TENANT, REMETENTE, { ...ENTRADA, email: null }, REDIRECT, PORTAL),
    ).rejects.toMatchObject({ statusCode: 422 })
    expect(authCalls).toHaveLength(0)
  })
})
