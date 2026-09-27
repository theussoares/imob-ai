import { afterEach, describe, expect, test, vi } from 'vitest'
import { fakeSupabaseWithAuth } from '../helpers/fake-supabase'

/**
 * "Esqueci minha senha" do painel (MELHORIA 03, teste de 27/09).
 *
 * O endpoint é público: quem esqueceu a senha não está logado. As ameaças que
 * este arquivo cobre são as do endpoint gêmeo do portal:
 *   - forçar reset de conta ALHEIA (de outra imobiliária, ou cliente do
 *     portal) com o remetente desta imobiliária — phishing autêntico;
 *   - descobrir quem é da equipe pela resposta;
 *   - usar o endpoint como torneira de e-mail (cota compartilhada por todos
 *     os tenants);
 *   - link apontando para host forjado por header.
 */

const TENANT = { id: 't1', slug: 'aurora', name: 'Aurora Imóveis', email: 'contato@aurora.com.br' }

async function montar(opts: { email: string; membros: { id: string; user_id: string; last_recovery_at: string | null }[] }) {
  vi.resetModules()
  const enviarEmail = vi.fn(async () => ({ enviado: true, provedor: 'teste' }))
  vi.doMock('~~/server/utils/mailer', () => ({ enviarEmail }))
  vi.doMock('~~/server/utils/mail-sender', () => ({ remetenteDoTenant: async () => 'avisos@moradi.app' }))
  vi.doMock('~~/server/utils/portal-origin', () => ({ painelOrigin: async () => 'https://painel.aurora.com.br' }))
  const fake = fakeSupabaseWithAuth({
    results: { tenant_members: [{ data: opts.membros, error: null }, { data: null, error: null }] },
    users: [
      { id: 'u-dono', email: 'dono@aurora.com.br', email_confirmed_at: '2026-09-01' },
      { id: 'u-outra', email: 'alguem@outra.com.br', email_confirmed_at: '2026-09-01' },
    ],
    hashedToken: 'h4sh',
  })
  vi.stubGlobal('defineEventHandler', (h: unknown) => h)
  vi.stubGlobal('useTenantContext', () => TENANT)
  vi.stubGlobal('readBody', async () => ({ email: opts.email }))
  vi.stubGlobal('serviceSupabase', () => fake.client)
  vi.stubGlobal('logWarn', () => {})
  vi.stubGlobal('logError', () => {})
  vi.stubGlobal('errMessage', (e: unknown) => String(e))
  const h = (await import('~~/server/api/painel/recuperar-senha.post')).default as unknown as (e: unknown) => Promise<unknown>
  return { run: () => h({}), enviarEmail, fake }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.doUnmock('~~/server/utils/mailer')
  vi.doUnmock('~~/server/utils/mail-sender')
  vi.doUnmock('~~/server/utils/portal-origin')
})

const MEMBRO = { id: 'm1', user_id: 'u-dono', last_recovery_at: null }

describe('POST /api/painel/recuperar-senha', () => {
  test('membro desta imobiliária recebe o link, apontando para o painel que veio do banco', async () => {
    const m = await montar({ email: '  DONO@aurora.com.br ', membros: [MEMBRO] })
    expect(await m.run()).toEqual({ ok: true })
    expect(m.enviarEmail).toHaveBeenCalledTimes(1)
    const msg = (m.enviarEmail.mock.calls[0] as unknown[])[0] as { para: string; texto: string }
    expect(msg.para).toBe('dono@aurora.com.br')
    // O link novo: nossa página com token_hash, que a prévia não gasta.
    expect(msg.texto).toContain('https://painel.aurora.com.br/admin/definir-senha?token_hash=h4sh&type=recovery')
    // A trava é gravada.
    expect(m.fake.calls.some((c) => c.table === 'tenant_members' && c.method === 'update')).toBe(true)
  })

  test('conta do Auth que NÃO é da equipe desta imobiliária não recebe nada — e a resposta é a mesma', async () => {
    const m = await montar({ email: 'alguem@outra.com.br', membros: [MEMBRO] })
    expect(await m.run()).toEqual({ ok: true })
    expect(m.enviarEmail).not.toHaveBeenCalled()
    expect(m.fake.authCalls.some((c) => c.method === 'generateLink')).toBe(false)
  })

  test('dentro do intervalo: não manda outro', async () => {
    const m = await montar({ email: 'dono@aurora.com.br', membros: [{ ...MEMBRO, last_recovery_at: new Date().toISOString() }] })
    expect(await m.run()).toEqual({ ok: true })
    expect(m.enviarEmail).not.toHaveBeenCalled()
  })

  test('e-mail malformado para antes de tocar no banco', async () => {
    const m = await montar({ email: 'nao-e-email', membros: [MEMBRO] })
    expect(await m.run()).toEqual({ ok: true })
    expect(m.fake.calls).toHaveLength(0)
  })
})
