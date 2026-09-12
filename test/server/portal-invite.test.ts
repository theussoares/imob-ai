import { describe, expect, test } from 'vitest'
import { invitePortalUser } from '~~/server/repositories/portal-invite.repository'
import { fakeSupabaseWithAuth } from '../helpers/fake-supabase'

/**
 * O convite de cliente carrega a armadilha de escalação de privilégio que o
 * `member.repository.ts` já documenta — e aqui ela é pior, porque o que está do
 * outro lado é o contrato e o comprovante de pagamento de um terceiro.
 */

const TENANT = 't1'
const REDIRECT = 'https://olmiimoveis.com.br/area-cliente/definir-senha'
const input = { name: 'Maria Souza', email: 'maria@exemplo.com' }

describe('invitePortalUser', () => {
  test('e-mail novo: cria a conta e devolve o link de senha', async () => {
    const { client, calls } = fakeSupabaseWithAuth({
      results: { portal_users: [{ data: null, error: null }, { data: null, error: null }] },
      link: 'https://exemplo/convite-maria',
    })

    const r = await invitePortalUser(client, TENANT, input, REDIRECT)

    expect(r.inviteLink).toBe('https://exemplo/convite-maria')
    expect(r.alreadyRegistered).toBe(false)
    expect(r.alreadyClient).toBe(false)
    // E o vínculo foi criado com o tenant certo.
    const insert = calls.find((c) => c.table === 'portal_users' && c.method === 'insert')
    expect((insert?.args[0] as Record<string, unknown>)?.tenant_id).toBe(TENANT)
  })

  test('🔴 e-mail que JÁ tem conta: cria o vínculo mas NÃO devolve link', async () => {
    // O cenário real: esse e-mail pode ser de um membro de painel, de um cliente
    // de outra imobiliária, ou do corretor testando. Devolver um magic link
    // faria quem convidou entrar COMO essa pessoa — e ler o contrato dela.
    const { client, authCalls } = fakeSupabaseWithAuth({
      results: { portal_users: [{ data: null, error: null }, { data: null, error: null }] },
      users: [{ id: 'user-existente', email: 'maria@exemplo.com' }],
      link: 'https://exemplo/NAO-DEVE-SAIR',
    })

    const r = await invitePortalUser(client, TENANT, input, REDIRECT)

    expect(r.inviteLink).toBeNull()
    expect(r.alreadyRegistered).toBe(true)
    // Confirma que o id foi resolvido pelo Auth, e não inventado.
    expect(authCalls.some((c) => c.method === 'listUsers')).toBe(true)
  })

  test('já é cliente desta imobiliária: não duplica o vínculo', async () => {
    const { client, calls } = fakeSupabaseWithAuth({
      results: { portal_users: { data: { id: 'pu-1' }, error: null } },
    })

    const r = await invitePortalUser(client, TENANT, input, REDIRECT)

    expect(r.alreadyClient).toBe(true)
    expect(calls.some((c) => c.table === 'portal_users' && c.method === 'insert')).toBe(false)
  })

  test('reenvio para quem ainda não confirmou devolve link de novo', async () => {
    // Convite perdido na caixa de entrada é a causa nº 1 de "não consigo
    // entrar". O reenvio precisa funcionar sem virar cadastro duplicado.
    const { client } = fakeSupabaseWithAuth({
      results: { portal_users: { data: { id: 'pu-1' }, error: null } },
      link: 'https://exemplo/reenvio',
    })

    const r = await invitePortalUser(client, TENANT, input, REDIRECT)

    expect(r.alreadyClient).toBe(true)
    expect(r.inviteLink).toBe('https://exemplo/reenvio')
  })

  test('e-mail inválido é recusado antes de tocar no Auth', async () => {
    const { client, authCalls } = fakeSupabaseWithAuth({})

    await expect(
      invitePortalUser(client, TENANT, { ...input, email: 'nao-e-email' }, REDIRECT),
    ).rejects.toMatchObject({ statusCode: 422 })

    expect(authCalls).toHaveLength(0)
  })

  test('nome vazio é recusado antes de tocar no Auth', async () => {
    const { client, authCalls } = fakeSupabaseWithAuth({})

    await expect(
      invitePortalUser(client, TENANT, { ...input, name: '   ' }, REDIRECT),
    ).rejects.toMatchObject({ statusCode: 422 })

    expect(authCalls).toHaveLength(0)
  })

  test('e-mail é normalizado para minúsculas', async () => {
    const { client, calls } = fakeSupabaseWithAuth({
      results: { portal_users: [{ data: null, error: null }, { data: null, error: null }] },
    })

    await invitePortalUser(client, TENANT, { ...input, email: 'Maria@Exemplo.COM ' }, REDIRECT)

    const insert = calls.find((c) => c.table === 'portal_users' && c.method === 'insert')
    expect((insert?.args[0] as Record<string, unknown>)?.email).toBe('maria@exemplo.com')
  })
})
