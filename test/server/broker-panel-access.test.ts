import { describe, expect, test } from 'vitest'
import {
  grantBrokerPanelAccess,
  revokeBrokerPanelAccess,
} from '~~/server/repositories/broker.repository'
import { inviteMember } from '~~/server/repositories/member.repository'
import { isAdminRole } from '~~/shared/models/member'
import { toBrokerModel } from '~~/server/mappers/broker.mapper'
import { fakeSupabaseWithAuth, hadEq, touched } from '../helpers/fake-supabase'

/**
 * Acesso do corretor ao painel (migrations 0028/0029).
 *
 * O que estes testes protegem é a metade que a RLS não cobre. A policy decide o
 * que o corretor ENXERGA depois de logado; aqui está o que acontece antes —
 * conceder e revogar o acesso, por um caminho que usa service role e portanto
 * roda sem RLS nenhuma. Se o escopo por tenant sumir daqui, nada no banco
 * segura.
 */

const REDIRECT = 'https://cliente.com.br/admin/definir-senha'

function brokerRow(over: Record<string, unknown> = {}) {
  return { id: 'b1', email: 'ana@imob.com', user_id: null, ...over }
}

describe('conceder acesso', () => {
  test('convida o e-mail do cadastro e liga a conta ao corretor', async () => {
    const { client, calls } = fakeSupabaseWithAuth({
      results: {
        brokers: [
          { data: brokerRow(), error: null },
          { data: null, error: null }, // update do vínculo
        ],
        tenant_members: [
          { data: null, error: null }, // ainda não é membro
          { data: null, error: null }, // insert
        ],
      },
    })

    const result = await grantBrokerPanelAccess(client, 't1', 'b1', REDIRECT)

    expect(result.email).toBe('ana@imob.com')
    expect(result.inviteLink).toBe('https://exemplo/convite')

    // O vínculo é o ponto: sem ele o corretor entra e não tem carteira.
    const update = calls.find((c) => c.table === 'brokers' && c.method === 'update')
    expect(update?.args[0]).toEqual({ user_id: 'novo-user' })
  })

  test('entra no painel como corretor, não como admin', async () => {
    const { client, calls } = fakeSupabaseWithAuth({
      results: {
        brokers: [{ data: brokerRow(), error: null }, { data: null, error: null }],
        tenant_members: [{ data: null, error: null }, { data: null, error: null }],
      },
    })

    await grantBrokerPanelAccess(client, 't1', 'b1', REDIRECT)

    const insert = calls.find((c) => c.table === 'tenant_members' && c.method === 'insert')
    expect(insert?.args[0]).toMatchObject({ role: 'broker', tenant_id: 't1' })
  })

  test('filtra por tenant ao buscar o corretor', async () => {
    const { client, calls } = fakeSupabaseWithAuth({
      results: {
        brokers: [{ data: brokerRow(), error: null }, { data: null, error: null }],
        tenant_members: [{ data: null, error: null }, { data: null, error: null }],
      },
    })

    await grantBrokerPanelAccess(client, 't1', 'b1', REDIRECT)

    // `brokerId` vem da URL: sem o filtro por tenant, um id descoberto por
    // tentativa daria acesso ao painel de outro cliente.
    expect(hadEq(calls, 'brokers', 'tenant_id')).toBe(true)
  })

  test('recusa corretor sem e-mail, sem criar convite', async () => {
    const { client, authCalls } = fakeSupabaseWithAuth({
      results: { brokers: [{ data: brokerRow({ email: null }), error: null }] },
    })

    await expect(grantBrokerPanelAccess(client, 't1', 'b1', REDIRECT)).rejects.toMatchObject({
      statusCode: 422,
    })
    expect(authCalls).toEqual([])
  })

  test('recusa corretor que já tem acesso', async () => {
    const { client, authCalls } = fakeSupabaseWithAuth({
      results: { brokers: [{ data: brokerRow({ user_id: 'u-existente' }), error: null }] },
    })

    await expect(grantBrokerPanelAccess(client, 't1', 'b1', REDIRECT)).rejects.toMatchObject({
      statusCode: 409,
    })
    // Reconvidar mandaria um e-mail de "defina sua senha" para quem já usa o
    // painel — parece phishing para quem recebe.
    expect(authCalls).toEqual([])
  })

  test('corretor inexistente no tenant dá 404', async () => {
    const { client } = fakeSupabaseWithAuth({ results: { brokers: [{ data: null, error: null }] } })

    await expect(grantBrokerPanelAccess(client, 't1', 'b-de-outro', REDIRECT)).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  test('mesmo login em dois cadastros vira mensagem, não erro cru do Postgres', async () => {
    const { client } = fakeSupabaseWithAuth({
      results: {
        brokers: [
          { data: brokerRow(), error: null },
          // 23505 = unique_violation, do índice uq_brokers_tenant_user.
          { data: null, error: { code: '23505', message: 'duplicate key value' } },
        ],
        tenant_members: [{ data: null, error: null }, { data: null, error: null }],
      },
    })

    await expect(grantBrokerPanelAccess(client, 't1', 'b1', REDIRECT)).rejects.toMatchObject({
      statusCode: 409,
    })
  })
})

describe('revogar acesso', () => {
  test('desfaz as duas metades: vínculo e associação ao tenant', async () => {
    const { client, calls } = fakeSupabaseWithAuth({
      results: {
        brokers: [{ data: brokerRow({ user_id: 'u-corretor' }), error: null }, { data: null, error: null }],
        tenant_members: [{ data: null, error: null }],
      },
    })

    await revokeBrokerPanelAccess(client, 't1', 'b1', 'u-admin')

    const update = calls.find((c) => c.table === 'brokers' && c.method === 'update')
    expect(update?.args[0]).toEqual({ user_id: null })
    expect(touched(calls, 'tenant_members')).toBe(true)
    expect(hadEq(calls, 'tenant_members', 'tenant_id')).toBe(true)
  })

  test('não deixa o admin remover o próprio acesso', async () => {
    const { client, calls } = fakeSupabaseWithAuth({
      results: { brokers: [{ data: brokerRow({ user_id: 'u-admin' }), error: null }] },
    })

    await expect(revokeBrokerPanelAccess(client, 't1', 'b1', 'u-admin')).rejects.toMatchObject({
      statusCode: 400,
    })
    // Nada pode ter sido desfeito antes da recusa.
    expect(calls.some((c) => c.method === 'update')).toBe(false)
  })

  test('corretor que nunca teve acesso não faz nada', async () => {
    const { client, calls } = fakeSupabaseWithAuth({
      results: { brokers: [{ data: brokerRow({ user_id: null }), error: null }] },
    })

    await revokeBrokerPanelAccess(client, 't1', 'b1', 'u-admin')

    expect(touched(calls, 'tenant_members')).toBe(false)
  })
})

describe('papel do convite', () => {
  test('convite comum continua entrando como admin', async () => {
    const { client, calls } = fakeSupabaseWithAuth({
      results: { tenant_members: [{ data: null, error: null }, { data: null, error: null }] },
    })

    await inviteMember(client, 't1', 'novo@imob.com', REDIRECT)

    const insert = calls.find((c) => c.table === 'tenant_members' && c.method === 'insert')
    expect(insert?.args[0]).toMatchObject({ role: 'admin' })
  })

  test('quem já é membro não é rebaixado por um convite repetido', async () => {
    const { client, calls } = fakeSupabaseWithAuth({
      results: { tenant_members: [{ data: { id: 'm1' }, error: null }] },
      users: [{ id: 'u1', email: 'ana@imob.com' }],
    })

    const result = await inviteMember(client, 't1', 'ana@imob.com', REDIRECT, 'broker')

    expect(result.alreadyMember).toBe(true)
    // Um update de papel aqui transformaria um admin em corretor sem que
    // ninguém tivesse pedido.
    expect(calls.some((c) => c.table === 'tenant_members' && c.method === 'update')).toBe(false)
  })
})

describe('fronteira de administrador', () => {
  test('corretor não conta como admin', () => {
    expect(isAdminRole('owner')).toBe(true)
    expect(isAdminRole('admin')).toBe(true)
    expect(isAdminRole('broker')).toBe(false)
  })

  test('papel desconhecido não vira admin por acidente', () => {
    // Papel novo criado direto no banco não deve herdar poder de admin.
    expect(isAdminRole('')).toBe(false)
    expect(isAdminRole('superadmin')).toBe(false)
  })
})

describe('payload do corretor', () => {
  test('o modelo expõe se tem acesso, nunca o id da conta', () => {
    const model = toBrokerModel({
      id: 'b1',
      tenant_id: 't1',
      name: 'Ana',
      phone: '5567999991111',
      email: 'ana@imob.com',
      creci: '12345',
      active: true,
      created_at: '2026-09-01T00:00:00.000Z',
      updated_at: '2026-09-01T00:00:00.000Z',
      user_id: 'uuid-da-conta',
    })

    expect(model.hasPanelAccess).toBe(true)
    // `user_id` liga o cadastro a uma conta de autenticação e não tem por que
    // trafegar até o navegador — nem no painel.
    expect(JSON.stringify(model)).not.toContain('uuid-da-conta')
    expect(Object.keys(model)).not.toContain('userId')
  })

  test('sem vínculo, hasPanelAccess é falso', () => {
    const model = toBrokerModel({
      id: 'b2',
      tenant_id: 't1',
      name: 'Bruno',
      phone: null,
      email: null,
      creci: null,
      active: true,
      created_at: '2026-09-01T00:00:00.000Z',
      updated_at: '2026-09-01T00:00:00.000Z',
      user_id: null,
    })

    expect(model.hasPanelAccess).toBe(false)
  })
})
