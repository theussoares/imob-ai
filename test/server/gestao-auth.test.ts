import { describe, expect, test } from 'vitest'
import {
  conferirCodigoGestao,
  emitirCodigoGestao,
  exigirLimiteLogin,
  exigirPermissao,
  montarContexto,
  resolverAcessoGestao,
  sessionIdDoJwt,
  type ContextoGestao,
} from '~~/server/utils/gestao-auth'
import { hashCodigoOtp } from '~~/server/utils/gestao-otp'
import { matrizPadrao } from '~~/layers/gestao/domain/permissions'
import { CODIGO_VALIDADE_MS } from '~~/layers/gestao/domain/auth'
import type { Tenant } from '~~/shared/models/tenant'
import { fakeSupabase, hadEq, touched } from '../helpers/fake-supabase'

/**
 * Porta de entrada do /gestao no servidor. As ameaças (Review Focus 3 e 4 do
 * plano): membro removido ou recurso desligado com sessão ainda válida; sessão
 * que pulou o 2º fator; código de outra conta; corrida de tentativas paralelas.
 */
const TENANT = { id: 'tenant-a', slug: 'olmi' } as Tenant
const SESSAO = '11111111-2222-4333-8444-555555555555'
const PEPPER = 'pepper'
const AGORA = Date.UTC(2026, 10, 17, 12)

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
const jwt = (claims: object) => `${b64({ alg: 'HS256' })}.${b64(claims)}.assinatura`
const TOKEN = jwt({ sub: 'u1', session_id: SESSAO })

const linhaMembro = (over: Record<string, unknown> = {}) => ({
  id: 'm1',
  tenant_id: TENANT.id,
  user_id: 'u1',
  email: 'ana@imob.com',
  nome: 'Ana',
  perfil: 'corretor',
  broker_id: 'b1',
  invite_token_hash: null,
  invite_expires_at: null,
  convidado_por: '',
  created_at: '2026-11-17T00:00:00Z',
  updated_at: '2026-11-17T00:00:00Z',
  ...over,
})

function cliente(results: Parameters<typeof fakeSupabase>[0], user: { id: string; email: string } | null = { id: 'u1', email: 'ana@imob.com' }) {
  const f = fakeSupabase(results)
  f.client.auth = {
    getUser: async () => (user ? { data: { user }, error: null } : { data: { user: null }, error: { message: 'invalid JWT' } }),
  }
  return f
}

const ligado = async () => true

describe('resolverAcessoGestao', () => {
  test('recurso gestao desligado no tenant: 404 mesmo com sessão válida', async () => {
    const { client, calls } = cliente({ gestao_members: { data: linhaMembro(), error: null } })
    await expect(
      resolverAcessoGestao({ db: client, tenant: TENANT, token: TOKEN, recursoAtivo: async () => false }, { segundoFator: true }),
    ).rejects.toMatchObject({ statusCode: 404 })
    expect(touched(calls, 'gestao_members')).toBe(false)
  })

  test('sem token: 401', async () => {
    const { client } = cliente({})
    await expect(resolverAcessoGestao({ db: client, tenant: TENANT, token: '', recursoAtivo: ligado }, { segundoFator: true })).rejects.toMatchObject({
      statusCode: 401,
    })
  })

  test('token recusado pelo Supabase: 401', async () => {
    const { client } = cliente({}, null)
    await expect(resolverAcessoGestao({ db: client, tenant: TENANT, token: TOKEN, recursoAtivo: ligado }, { segundoFator: true })).rejects.toMatchObject({
      statusCode: 401,
    })
  })

  test('membro removido (sem vínculo neste tenant) com sessão ainda válida: 401 na próxima chamada', async () => {
    const { client, calls } = cliente({ gestao_members: { data: null, error: null } })
    await expect(resolverAcessoGestao({ db: client, tenant: TENANT, token: TOKEN, recursoAtivo: ligado }, { segundoFator: true })).rejects.toMatchObject({
      statusCode: 401,
    })
    // Procurado pelo tenant do HOST: o vínculo em outra imobiliária não conta.
    expect(calls).toContainEqual({ table: 'gestao_members', method: 'eq', args: ['tenant_id', TENANT.id] })
    expect(calls).toContainEqual({ table: 'gestao_members', method: 'eq', args: ['user_id', 'u1'] })
  })

  test('sessão que não cumpriu o 2º fator: 401 com motivo segundo_fator', async () => {
    const { client, calls } = cliente({ gestao_members: { data: linhaMembro(), error: null }, gestao_sessions: { data: null, error: null } })
    await expect(resolverAcessoGestao({ db: client, tenant: TENANT, token: TOKEN, recursoAtivo: ligado }, { segundoFator: true })).rejects.toMatchObject({
      statusCode: 401,
      data: { motivo: 'segundo_fator' },
    })
    for (const col of ['tenant_id', 'user_id', 'session_id']) expect(hadEq(calls, 'gestao_sessions', col)).toBe(true)
  })

  test('JWT sem session_id não passa (não há o que amarrar ao 2º fator)', async () => {
    const { client } = cliente({ gestao_members: { data: linhaMembro(), error: null } })
    await expect(
      resolverAcessoGestao({ db: client, tenant: TENANT, token: jwt({ sub: 'u1' }), recursoAtivo: ligado }, { segundoFator: false }),
    ).rejects.toMatchObject({ statusCode: 401 })
  })

  test('ok: membro do banco, e-mail do Auth; contexto com corretorId = brokerId e matriz do tenant', async () => {
    const matriz = { ...matrizPadrao(), consulta: { corretor: 'sim', recepcao: 'sim', juridico: 'sim', dono: 'sim' } }
    const { client } = cliente({
      gestao_members: { data: linhaMembro(), error: null },
      gestao_sessions: { data: { session_id: SESSAO }, error: null },
      gestao_settings: { data: { matriz, config: null }, error: null },
    })
    const a = await resolverAcessoGestao({ db: client, tenant: TENANT, token: TOKEN, recursoAtivo: ligado }, { segundoFator: true })
    expect(a).toMatchObject({ sessionId: SESSAO, email: 'ana@imob.com', membro: { userId: 'u1', perfil: 'corretor', brokerId: 'b1' } })
    const ctx = await montarContexto(a)
    expect(ctx.sessao).toEqual({ perfil: 'corretor', nome: 'Ana', corretorId: 'b1' })
    expect(ctx.matriz.consulta.corretor).toBe('sim')
  })
})

describe('sessionIdDoJwt', () => {
  test('lê só uuid; lixo vira null', () => {
    expect(sessionIdDoJwt(TOKEN)).toBe(SESSAO)
    expect(sessionIdDoJwt(jwt({ session_id: "x' or 1=1" }))).toBeNull()
    expect(sessionIdDoJwt('nao-e-jwt')).toBeNull()
  })
})

describe('exigirPermissao', () => {
  const ctx = (perfil: 'corretor' | 'dono') =>
    ({ matriz: matrizPadrao(), membro: { perfil } }) as unknown as ContextoGestao
  test('nao → 403; proprio e sim passam', () => {
    expect(() => exigirPermissao(ctx('corretor'), 'valores')).toThrow(expect.objectContaining({ statusCode: 403 }))
    expect(() => exigirPermissao(ctx('corretor'), 'editar')).not.toThrow()
    expect(() => exigirPermissao(ctx('dono'), 'admin')).not.toThrow()
  })
})

describe('2º fator com o banco', () => {
  const otp = (over: Record<string, unknown> = {}) => ({
    tenant_id: TENANT.id,
    user_id: 'u1',
    code_hash: hashCodigoOtp(PEPPER, TENANT.id, 'u1', '123456'),
    expires_at: new Date(AGORA + CODIGO_VALIDADE_MS).toISOString(),
    attempts: 0,
    locked_until: null,
    last_sent_at: new Date(AGORA).toISOString(),
    consumed_at: null,
    ...over,
  })
  const base = { tenantId: TENANT.id, userId: 'u1', sessionId: SESSAO, agora: AGORA + 1000, pepper: PEPPER }

  test('código certo: grava com condição de tentativas e marca a sessão NESTE tenant', async () => {
    const { client, calls } = cliente({
      gestao_otp: [{ data: otp({ attempts: 2 }), error: null }, { data: [{ user_id: 'u1' }], error: null }],
      gestao_sessions: { data: null, error: null },
    })
    const r = await conferirCodigoGestao(client, { ...base, codigo: '123456' })
    expect(r.ok).toBe(true)
    expect(calls).toContainEqual({ table: 'gestao_otp', method: 'eq', args: ['attempts', 2] })
    const up = calls.find((c) => c.table === 'gestao_sessions' && c.method === 'upsert')!
    expect(up.args[0]).toMatchObject({ session_id: SESSAO, tenant_id: TENANT.id, user_id: 'u1' })
  })

  test('corrida: outra tentativa gravou antes → 409 e a sessão NÃO é marcada, mesmo com o código certo', async () => {
    const { client, calls } = cliente({ gestao_otp: [{ data: otp(), error: null }, { data: [], error: null }] })
    await expect(conferirCodigoGestao(client, { ...base, codigo: '123456' })).rejects.toMatchObject({ statusCode: 409 })
    expect(touched(calls, 'gestao_sessions')).toBe(false)
  })

  test('código emitido para outro usuário não serve', async () => {
    const outro = otp({ code_hash: hashCodigoOtp(PEPPER, TENANT.id, 'u2', '123456') })
    const { client, calls } = cliente({ gestao_otp: [{ data: outro, error: null }, { data: [{ user_id: 'u1' }], error: null }] })
    const r = await conferirCodigoGestao(client, { ...base, codigo: '123456' })
    expect(r).toMatchObject({ ok: false, motivo: 'invalido' })
    expect(touched(calls, 'gestao_sessions')).toBe(false)
  })

  test('reuso: código consumido falha sem gravar nada', async () => {
    const { client, calls } = cliente({ gestao_otp: { data: otp({ consumed_at: new Date(AGORA).toISOString() }), error: null } })
    const r = await conferirCodigoGestao(client, { ...base, codigo: '123456' })
    expect(r).toMatchObject({ ok: false, motivo: 'inexistente' })
    expect(calls.some((c) => c.table === 'gestao_otp' && c.method === 'update')).toBe(false)
  })

  test('bloqueado: o código certo também é recusado', async () => {
    const travado = otp({ attempts: 5, locked_until: new Date(AGORA + 10 * 60_000).toISOString() })
    const { client } = cliente({ gestao_otp: { data: travado, error: null } })
    expect(await conferirCodigoGestao(client, { ...base, codigo: '123456' })).toMatchObject({ ok: false, motivo: 'bloqueado' })
  })

  test('formato errado é 422 e não gasta tentativa', async () => {
    const { client, calls } = cliente({})
    await expect(conferirCodigoGestao(client, { ...base, codigo: '12a456' })).rejects.toMatchObject({ statusCode: 422 })
    expect(touched(calls, 'gestao_otp')).toBe(false)
  })

  test('emitir: envia e só então grava o hash (nunca o código), mantendo as tentativas', async () => {
    const enviados: string[] = []
    const lido = otp({ attempts: 3, last_sent_at: new Date(AGORA - 120_000).toISOString() })
    const { client, calls } = cliente({ gestao_otp: [{ data: lido, error: null }, { data: [{ user_id: 'u1' }], error: null }] })
    const r = await emitirCodigoGestao(client, { ...base, enviar: async (c) => void enviados.push(c) })
    expect(r).toEqual({ enviado: true, segundos: 60 })
    expect(enviados).toHaveLength(1)
    const up = calls.find((c) => c.table === 'gestao_otp' && c.method === 'update')!
    const linha = up.args[0] as Record<string, unknown>
    expect(linha).toMatchObject({ attempts: 3 })
    expect(JSON.stringify(linha)).not.toContain(enviados[0])
    expect(linha.code_hash).toBe(hashCodigoOtp(PEPPER, TENANT.id, 'u1', enviados[0]!))
    expect(hadEq(calls, 'gestao_otp', 'tenant_id')).toBe(true)
  })

  test('emitir: tentativa feita DURANTE o envio não é apagada pelo estado velho → 409', async () => {
    // Achado da revisão de segurança da F1: o upsert incondicional zerava o
    // bloqueio gravado pelos palpites dados enquanto o e-mail saía.
    const lido = otp({ attempts: 3, last_sent_at: new Date(AGORA - 120_000).toISOString() })
    const { client, calls } = cliente({ gestao_otp: [{ data: lido, error: null }, { data: [], error: null }] })
    await expect(emitirCodigoGestao(client, { ...base, enviar: async () => {} })).rejects.toMatchObject({ statusCode: 409 })
    expect(calls).toContainEqual({ table: 'gestao_otp', method: 'eq', args: ['attempts', 3] })
    expect(calls).toContainEqual({ table: 'gestao_otp', method: 'eq', args: ['code_hash', lido.code_hash] })
    expect(calls.some((c) => c.table === 'gestao_otp' && c.method === 'upsert')).toBe(false)
  })

  test('emitir: primeiro código é insert (dois logins simultâneos: o segundo perde, não sobrescreve)', async () => {
    const { client, calls } = cliente({ gestao_otp: [{ data: null, error: null }, { data: null, error: { code: '23505', message: 'dup' } }] })
    await expect(emitirCodigoGestao(client, { ...base, enviar: async () => {} })).rejects.toMatchObject({ statusCode: 409 })
    expect(calls.some((c) => c.table === 'gestao_otp' && c.method === 'insert')).toBe(true)
  })

  test('emitir: envio que falha não grava nada (a espera de 60 s não vale para código que não chegou)', async () => {
    const { client, calls } = cliente({ gestao_otp: { data: null, error: null } })
    await expect(
      emitirCodigoGestao(client, {
        ...base,
        enviar: async () => {
          throw new Error('provedor fora')
        },
      }),
    ).rejects.toThrow()
    expect(calls.some((c) => c.table === 'gestao_otp' && (c.method === 'insert' || c.method === 'update'))).toBe(false)
  })
})

describe('limite de login', () => {
  test('5 falhas da conta na janela: 429', async () => {
    const { client } = cliente({ gestao_login_falhas: [{ data: null, error: null, count: 5 }, { data: null, error: null, count: 0 }] })
    await expect(exigirLimiteLogin(client, TENANT.id, { conta: 'c', ip: 'i' }, AGORA)).rejects.toMatchObject({ statusCode: 429 })
  })

  test('abaixo do limite passa, e a contagem é no tenant', async () => {
    const { client, calls } = cliente({ gestao_login_falhas: [{ data: null, error: null, count: 4 }, { data: null, error: null, count: 19 }] })
    await expect(exigirLimiteLogin(client, TENANT.id, { conta: 'c', ip: 'i' }, AGORA)).resolves.toBeUndefined()
    expect(hadEq(calls, 'gestao_login_falhas', 'tenant_id')).toBe(true)
  })
})
