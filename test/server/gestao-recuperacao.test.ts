import { describe, expect, test, vi } from 'vitest'
import { redefinirSenha, solicitarRecuperacao, ERRO_LINK_INVALIDO } from '~~/server/utils/gestao-recuperacao'
import { fakeSupabase, hadEq, touched } from '../helpers/fake-supabase'

/**
 * Ameaças cobertas: (1) a tela virar verificador de quem é da equipe; (2) link de recuperação de outra
 * imobiliária (ou do /admin) trocando a senha aqui; (3) senha trocada deixando sessões antigas abertas;
 * (4) senha fraca queimando o link; (5) a tela virar disparador de e-mail.
 */
const TENANT = { id: 'tenant-a', slug: 'olmi', name: 'Olmi Imóveis' }
const AGORA = Date.UTC(2026, 10, 23, 12)
const SENHA = 'Cavalo-Azul-Mesa-2026!'

const membro = (over: Record<string, unknown> = {}) => ({
  id: 'm1', tenant_id: TENANT.id, user_id: 'u1', email: 'ana@imob.com', nome: 'Ana', perfil: 'corretor', broker_id: 'b1',
  invite_token_hash: null, invite_expires_at: null, convidado_por: '', created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-01T00:00:00Z', ...over,
})
const livre = { gestao_login_falhas: [{ data: null, error: null, count: 0 }, { data: null, error: null, count: 0 }] }

function db(results: Parameters<typeof fakeSupabase>[0], auth: Record<string, unknown> = {}) {
  const f = fakeSupabase({ ...livre, ...results })
  const admin = { generateLink: vi.fn(async () => ({ data: { properties: { hashed_token: 'hash-abc' } }, error: null })), updateUserById: vi.fn(async () => ({ error: null })), signOut: vi.fn(async () => ({})), ...auth }
  f.client.auth = { admin } as never
  return { ...f, admin }
}

describe('solicitarRecuperacao', () => {
  const base = (client: ReturnType<typeof db>['client'], enviar = vi.fn(async () => {})) => ({
    db: client, tenant: TENANT, email: 'ana@imob.com', ip: 'ip-hash', pepper: 'p', agora: AGORA, origem: 'https://olmi.exemplo', enviar,
  })

  test('membro ativo do tenant: link para a NOSSA página com o token_hash, e e-mail enviado', async () => {
    const f = db({ gestao_members: { data: membro(), error: null } })
    const enviar = vi.fn(async () => {})
    await solicitarRecuperacao(base(f.client, enviar))
    expect(enviar).toHaveBeenCalledTimes(1)
    const link = (enviar.mock.calls[0] as unknown as [string])[0]
    expect(link).toBe('https://olmi.exemplo/gestao/redefinir-senha?token_hash=hash-abc')
    expect(hadEq(f.calls, 'gestao_members', 'tenant_id')).toBe(true)
  })

  test('e-mail que não é membro deste tenant: nada enviado, nenhum link gerado, e nenhum erro (resposta igual)', async () => {
    const f = db({ gestao_members: { data: null, error: null } })
    const enviar = vi.fn(async () => {})
    await expect(solicitarRecuperacao(base(f.client, enviar))).resolves.toBeUndefined()
    expect(enviar).not.toHaveBeenCalled()
    expect(f.admin.generateLink).not.toHaveBeenCalled()
  })

  test('falha ao enviar o e-mail não vaza: a resposta segue igual', async () => {
    const f = db({ gestao_members: { data: membro(), error: null } })
    await expect(solicitarRecuperacao(base(f.client, vi.fn(async () => { throw new Error('smtp') })))).resolves.toBeUndefined()
  })

  test('muitos pedidos da mesma conta: 429 antes de qualquer consulta de membro', async () => {
    const f = db({ gestao_login_falhas: [{ data: null, error: null, count: 5 }, { data: null, error: null, count: 0 }] })
    await expect(solicitarRecuperacao(base(f.client))).rejects.toMatchObject({ statusCode: 429 })
    expect(touched(f.calls, 'gestao_members')).toBe(false)
  })

  test('todo pedido é contado (inclusive de e-mail desconhecido), no tenant', async () => {
    const f = db({ gestao_members: { data: null, error: null } })
    await solicitarRecuperacao(base(f.client))
    expect(f.calls.some((c) => c.table === 'gestao_login_falhas' && c.method === 'insert')).toBe(true)
  })
})

describe('redefinirSenha', () => {
  const sessao = { access_token: 'tok-recuperacao' }
  const cliente = (over: Record<string, unknown> = {}) =>
    ({ auth: { verifyOtp: vi.fn(async () => ({ data: { user: { id: 'u1', email: 'ana@imob.com' }, session: sessao }, error: null })), ...over } }) as never
  const base = (f: ReturnType<typeof db>, c = cliente(), senha = SENHA) => ({
    db: f.client, cliente: c, tenant: TENANT, tokenHash: 'hash-abc', senha, ip: 'ip-hash', pepper: 'p', agora: AGORA,
  })

  test('caminho feliz: troca a senha, encerra TODAS as sessões e registra o evento — sem abrir sessão', async () => {
    const f = db({ gestao_members: { data: membro(), error: null } })
    const r = await redefinirSenha(base(f))
    expect(r).toEqual({ ok: true })
    expect(f.admin.updateUserById).toHaveBeenCalledWith('u1', { password: SENHA })
    expect(f.admin.signOut).toHaveBeenCalledWith('tok-recuperacao', 'global')
    expect(f.calls.some((c) => c.table === 'gestao_eventos' && c.method === 'insert')).toBe(true)
  })

  test('token inválido/gasto: mensagem única e não troca nada', async () => {
    const f = db({})
    const r = await redefinirSenha(base(f, cliente({ verifyOtp: vi.fn(async () => ({ data: { user: null, session: null }, error: { message: 'expired' } })) })))
    expect(r).toMatchObject({ ok: false, erro: ERRO_LINK_INVALIDO, motivo: 'link' })
    expect(f.admin.updateUserById).not.toHaveBeenCalled()
  })

  test('link de quem NÃO é membro deste tenant (outra imobiliária, /admin): não troca a senha e encerra a sessão aberta', async () => {
    const f = db({ gestao_members: { data: null, error: null } })
    const r = await redefinirSenha(base(f))
    expect(r).toMatchObject({ ok: false, motivo: 'link' })
    expect(f.admin.updateUserById).not.toHaveBeenCalled()
    expect(f.admin.signOut).toHaveBeenCalledWith('tok-recuperacao', 'global')
    expect(hadEq(f.calls, 'gestao_members', 'tenant_id')).toBe(true)
  })

  test('senha fraca é recusada ANTES de gastar o token', async () => {
    const f = db({})
    const c = cliente()
    const r = await redefinirSenha(base(f, c, '12345678'))
    expect(r).toMatchObject({ ok: false, motivo: 'senha' })
    expect((c as { auth: { verifyOtp: ReturnType<typeof vi.fn> } }).auth.verifyOtp).not.toHaveBeenCalled()
  })

  test('senha que contém o e-mail passa na regra básica mas é recusada com o contexto do membro', async () => {
    const f = db({ gestao_members: { data: membro(), error: null } })
    const r = await redefinirSenha(base(f, cliente(), 'ana@imob.com-Cavalo-2026!'))
    expect(r).toMatchObject({ ok: false, motivo: 'senha' })
    expect(f.admin.updateUserById).not.toHaveBeenCalled()
  })

  test('falha do Auth ao trocar: erro claro, sessão encerrada, sem evento de sucesso', async () => {
    const f = db({ gestao_members: { data: membro(), error: null } }, { updateUserById: vi.fn(async () => ({ error: { message: 'boom' } })) })
    const r = await redefinirSenha(base(f))
    expect(r).toMatchObject({ ok: false })
    expect(f.admin.signOut).toHaveBeenCalled()
    expect(f.calls.some((c) => c.table === 'gestao_eventos')).toBe(false)
  })

  test('tentativas demais por IP: 429, sem consultar o Auth', async () => {
    const f = db({ gestao_login_falhas: [{ data: null, error: null, count: 5 }, { data: null, error: null, count: 0 }] })
    const c = cliente()
    await expect(redefinirSenha(base(f, c))).rejects.toMatchObject({ statusCode: 429 })
    expect((c as { auth: { verifyOtp: ReturnType<typeof vi.fn> } }).auth.verifyOtp).not.toHaveBeenCalled()
  })
})
