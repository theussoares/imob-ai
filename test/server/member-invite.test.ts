import { describe, expect, test } from 'vitest'
import { inviteMember, listMembers, removeMember } from '~~/server/repositories/member.repository'
import { fakeSupabaseWithAuth, hadEq, touched } from '../helpers/fake-supabase'

const TENANT = 't1'
const REDIRECT = 'https://painel.exemplo.com.br/admin/definir-senha'

describe('inviteMember', () => {
  test('cria o vínculo e devolve o link quando o e-mail não tem conta', async () => {
    const { client } = fakeSupabaseWithAuth({
      results: {
        tenant_members: [
          { data: null, error: null },
          { data: null, error: null },
        ],
      },
      users: [],
      link: 'https://exemplo/convite-abc',
    })

    const r = await inviteMember(client, TENANT, 'nova@imob.com', REDIRECT)

    expect(r.inviteLink).toBe('https://exemplo/convite-abc')
    expect(r.alreadyRegistered).toBe(false)
  })

  test('NÃO devolve link quando o e-mail já tem conta', async () => {
    // Invariante de segurança: se esse e-mail é de alguém de OUTRA imobiliária,
    // devolver um link de acesso deixaria quem convidou entrar como aquela
    // pessoa e ver os dados do outro cliente.
    const { client } = fakeSupabaseWithAuth({
      results: {
        tenant_members: [
          { data: null, error: null },
          { data: null, error: null },
        ],
      },
      users: [{ id: 'u-outro-tenant', email: 'ja@existe.com' }],
    })

    const r = await inviteMember(client, TENANT, 'ja@existe.com', REDIRECT)

    expect(r.inviteLink).toBeNull()
    expect(r.alreadyRegistered).toBe(true)
  })

  test('vincula o usuário existente ao tenant mesmo sem gerar link', async () => {
    const { client, calls } = fakeSupabaseWithAuth({
      results: {
        tenant_members: [
          { data: null, error: null },
          { data: null, error: null },
        ],
      },
      users: [{ id: 'u-existente', email: 'ja@existe.com' }],
    })

    await inviteMember(client, TENANT, 'ja@existe.com', REDIRECT)

    const insert = calls.find((c) => c.table === 'tenant_members' && c.method === 'insert')
    expect(insert?.args[0]).toMatchObject({ tenant_id: TENANT, user_id: 'u-existente' })
  })

  test('não duplica quando a pessoa já é membro', async () => {
    const { client, calls } = fakeSupabaseWithAuth({
      // Primeira consulta: já existe vínculo deste usuário neste tenant.
      results: { tenant_members: [{ data: { id: 'm1' }, error: null }] },
      users: [{ id: 'u-existente', email: 'ja@existe.com' }],
    })

    const r = await inviteMember(client, TENANT, 'ja@existe.com', REDIRECT)

    expect(r.alreadyMember).toBe(true)
    expect(calls.some((c) => c.table === 'tenant_members' && c.method === 'insert')).toBe(false)
  })

  test('recusa e-mail inválido antes de criar qualquer coisa', async () => {
    const { client, calls, authCalls } = fakeSupabaseWithAuth({ users: [] })

    await expect(inviteMember(client, TENANT, 'não é e-mail', REDIRECT)).rejects.toMatchObject({
      statusCode: 422,
    })

    expect(touched(calls, 'tenant_members')).toBe(false)
    expect(authCalls).toHaveLength(0)
  })
})

describe('removeMember', () => {
  test('recusa remover a si mesmo', async () => {
    const { client } = fakeSupabaseWithAuth({
      results: { tenant_members: [{ data: { id: 'm1', user_id: 'eu' }, error: null }] },
    })

    await expect(removeMember(client, TENANT, 'm1', 'eu')).rejects.toMatchObject({
      statusCode: 400,
    })
  })

  test('recusa remover o último membro', async () => {
    // Sem esta guarda um clique errado tranca a imobiliária fora do painel, e só
    // um SQL manual destrava.
    const { client } = fakeSupabaseWithAuth({
      results: {
        tenant_members: [
          { data: { id: 'm1', user_id: 'outro' }, error: null },
          { data: [{ id: 'm1' }], error: null }, // só um membro no tenant
        ],
      },
    })

    await expect(removeMember(client, TENANT, 'm1', 'eu')).rejects.toMatchObject({
      statusCode: 409,
    })
  })

  test('remove quando não é você e há outros membros', async () => {
    const { client, calls } = fakeSupabaseWithAuth({
      results: {
        tenant_members: [
          { data: { id: 'm2', user_id: 'outro' }, error: null },
          { data: [{ id: 'm1' }, { id: 'm2' }], error: null },
          { data: null, error: null },
        ],
      },
    })

    await removeMember(client, TENANT, 'm2', 'eu')

    expect(calls.some((c) => c.table === 'tenant_members' && c.method === 'delete')).toBe(true)
  })

  test('recusa remover membro de outro tenant', async () => {
    // O id do vínculo vem da URL. Sem filtrar por tenant, quem descobrisse um id
    // alheio removeria o acesso de outro cliente.
    const { client } = fakeSupabaseWithAuth({
      results: { tenant_members: [{ data: null, error: null }] },
    })

    await expect(removeMember(client, TENANT, 'm-de-outro', 'eu')).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})

describe('listMembers', () => {
  test('mostra o e-mail de cada membro', async () => {
    // `tenant_members` guarda só o user_id; sem o e-mail a tela listaria UUIDs.
    const { client } = fakeSupabaseWithAuth({
      results: {
        tenant_members: [
          { data: [{ id: 'm1', user_id: 'u1', role: 'admin', created_at: '2026-08-18T00:00:00Z' }], error: null },
        ],
      },
      users: [{ id: 'u1', email: 'ana@imob.com', email_confirmed_at: '2026-08-18T00:00:00Z' }],
    })

    const list = await listMembers(client, TENANT)

    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ email: 'ana@imob.com', pending: false })
  })

  test('marca como pendente quem ainda não confirmou o convite', async () => {
    const { client } = fakeSupabaseWithAuth({
      results: {
        tenant_members: [
          { data: [{ id: 'm2', user_id: 'u2', role: 'admin', created_at: '2026-08-18T00:00:00Z' }], error: null },
        ],
      },
      users: [{ id: 'u2', email: 'novo@imob.com', email_confirmed_at: null }],
    })

    const list = await listMembers(client, TENANT)

    expect(list[0]).toMatchObject({ email: 'novo@imob.com', pending: true })
  })

  test('filtra por tenant — a listagem usa service role e ignoraria a RLS', async () => {
    const { client, calls } = fakeSupabaseWithAuth({
      results: { tenant_members: [{ data: [], error: null }] },
      users: [],
    })

    await listMembers(client, TENANT)

    expect(hadEq(calls, 'tenant_members', 'tenant_id')).toBe(true)
  })
})
