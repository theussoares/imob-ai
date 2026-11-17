import { describe, expect, test } from 'vitest'
import {
  buscarConvite,
  buscarMembroPorUsuario,
  gravarConvite,
  listarMembros,
  removerMembro,
  vincularUsuarioAoConvite,
} from '~~/server/repositories/gestao-member.repository'
import { gravarMatriz, lerSettings } from '~~/server/repositories/gestao-settings.repository'
import { listarEventos, registrarEvento } from '~~/server/repositories/gestao-evento.repository'
import { matrizDoBanco, configDoBanco } from '~~/server/mappers/gestao-settings.mapper'
import {
  perfilECorretorDoPedido,
  regraAlterarMembro,
  regraConvite,
  regraRemoverMembro,
  validarConfigPedido,
  validarMatrizPedido,
} from '~~/server/utils/gestao-membros'
import { matrizPadrao } from '~~/layers/gestao/domain/permissions'
import { configuracoesPadrao } from '~~/layers/gestao/domain/configuracoes'
import { fakeSupabase, hadEq } from '../helpers/fake-supabase'

/**
 * Repositories e regras dos membros do /gestao. Toda consulta aqui roda pela
 * service_role (sem RLS), então o que os testes de escopo afirmam é a única
 * barreira entre imobiliárias: a cadeia enviada leva `tenant_id`.
 */
const T = 'tenant-a'

function linhaMembro(over: Record<string, unknown> = {}) {
  return {
    id: 'm1',
    tenant_id: T,
    user_id: 'u1',
    email: 'ana@imob.com',
    nome: 'Ana',
    perfil: 'corretor',
    broker_id: 'b1',
    invite_token_hash: 'h',
    invite_expires_at: '2026-11-20T12:00:00.000Z',
    convidado_por: 'Helena',
    created_at: '2026-11-17T12:00:00.000Z',
    updated_at: '2026-11-17T12:00:00.000Z',
    ...over,
  }
}

describe('gestao-member.repository', () => {
  test('buscarMembroPorUsuario filtra por tenant E usuário, e só membro que aceitou', async () => {
    const { client, calls } = fakeSupabase({ gestao_members: { data: linhaMembro(), error: null } })
    const m = await buscarMembroPorUsuario(client, T, 'u1')
    expect(m).toEqual({ id: 'm1', userId: 'u1', tenantId: T, nome: 'Ana', perfil: 'corretor', brokerId: 'b1' })
    expect(hadEq(calls, 'gestao_members', 'tenant_id')).toBe(true)
    expect(hadEq(calls, 'gestao_members', 'user_id')).toBe(true)
  })

  test('perfil fora dos quatro no banco não vira membro (falha fechado)', async () => {
    const { client } = fakeSupabase({ gestao_members: { data: linhaMembro({ perfil: 'admin' }), error: null } })
    expect(await buscarMembroPorUsuario(client, T, 'u1')).toBeNull()
  })

  test('listarMembros não devolve o hash do convite e calcula o status', async () => {
    const { client, calls } = fakeSupabase({
      gestao_members: {
        data: [
          linhaMembro(),
          linhaMembro({ id: 'm2', user_id: null, invite_expires_at: '2026-11-18T00:00:00.000Z' }),
          linhaMembro({ id: 'm3', user_id: null, invite_expires_at: '2026-11-01T00:00:00.000Z' }),
        ],
        error: null,
      },
    })
    const lista = await listarMembros(client, T, Date.parse('2026-11-17T13:00:00.000Z'))
    expect(lista.map((m) => m.status)).toEqual(['ativo', 'pendente', 'expirado'])
    expect(JSON.stringify(lista)).not.toContain('invite_token_hash')
    expect(Object.keys(lista[0]!)).not.toContain('inviteTokenHash')
    expect(hadEq(calls, 'gestao_members', 'tenant_id')).toBe(true)
    expect(calls.some((c) => c.method === 'limit' && c.args[0] === 200)).toBe(true)
  })

  test('convite para e-mail que já tem conta ativa no tenant é 409', async () => {
    const { client } = fakeSupabase({ gestao_members: { data: linhaMembro(), error: null } })
    await expect(
      gravarConvite(client, T, {
        email: 'ana@imob.com',
        nome: '',
        perfil: 'recepcao',
        brokerId: null,
        tokenHash: 'novo',
        expiraEm: '2026-11-20T12:00:00.000Z',
        convidadoPor: 'Helena',
        perfilConvidante: 'dono',
      }),
    ).rejects.toMatchObject({ statusCode: 409 })
  })

  test('reconvidar e-mail pendente atualiza o MESMO registro (um convite vivo por e-mail)', async () => {
    const { client, calls } = fakeSupabase({
      gestao_members: [
        { data: linhaMembro({ user_id: null }), error: null },
        { data: linhaMembro({ user_id: null, perfil: 'recepcao', broker_id: null }), error: null },
      ],
    })
    await gravarConvite(client, T, {
      email: 'ana@imob.com',
      nome: '',
      perfil: 'recepcao',
      brokerId: null,
      tokenHash: 'novo',
      expiraEm: '2026-11-20T12:00:00.000Z',
      convidadoPor: 'Helena',
      perfilConvidante: 'dono',
    })
    expect(calls.some((c) => c.method === 'update')).toBe(true)
    expect(calls.some((c) => c.method === 'insert')).toBe(false)
    // O update não pode pegar um registro que acabou de ser aceito.
    expect(calls.some((c) => c.method === 'is' && c.args[0] === 'user_id' && c.args[1] === null)).toBe(true)
  })

  test('Jurídico não sobrescreve o convite pendente de um Dono reconvidando o e-mail', async () => {
    // Achado da revisão de segurança da F1: o DELETE barrava, o reconvite não.
    const { client, calls } = fakeSupabase({ gestao_members: { data: linhaMembro({ user_id: null, perfil: 'dono', broker_id: null }), error: null } })
    await expect(
      gravarConvite(client, T, {
        email: 'ana@imob.com',
        nome: '',
        perfil: 'juridico',
        brokerId: null,
        tokenHash: 'novo',
        expiraEm: '2026-11-20T12:00:00.000Z',
        convidadoPor: 'Paulo',
        perfilConvidante: 'juridico',
      }),
    ).rejects.toMatchObject({ statusCode: 403 })
    expect(calls.some((c) => c.method === 'update' || c.method === 'insert')).toBe(false)
  })

  test('buscarConvite procura pelo hash dentro do tenant', async () => {
    const { client, calls } = fakeSupabase({ gestao_members: { data: linhaMembro({ user_id: null }), error: null } })
    const c = await buscarConvite(client, T, 'h')
    expect(c?.email).toBe('ana@imob.com')
    expect(hadEq(calls, 'gestao_members', 'tenant_id')).toBe(true)
    expect(hadEq(calls, 'gestao_members', 'invite_token_hash')).toBe(true)
  })

  test('aceitar só vincula convite ainda sem usuário (corrida de duas abas perde)', async () => {
    const { client, calls } = fakeSupabase({ gestao_members: { data: [], error: null } })
    expect(await vincularUsuarioAoConvite(client, T, 'm1', 'u9', 'Ana')).toBe(false)
    expect(calls.some((c) => c.method === 'is' && c.args[0] === 'user_id')).toBe(true)
    expect(hadEq(calls, 'gestao_members', 'tenant_id')).toBe(true)
  })

  test('remover apaga o vínculo E as sessões verificadas e o código, no tenant', async () => {
    const { client, calls } = fakeSupabase({})
    await removerMembro(client, T, { id: 'm1', userId: 'u1' })
    for (const t of ['gestao_members', 'gestao_sessions', 'gestao_otp']) {
      expect(calls.some((c) => c.table === t && c.method === 'delete')).toBe(true)
      expect(hadEq(calls, t, 'tenant_id')).toBe(true)
    }
  })
})

describe('gestao-settings', () => {
  test('sem linha: padrão do domínio', async () => {
    const { client, calls } = fakeSupabase({ gestao_settings: { data: null, error: null } })
    const s = await lerSettings(client, T)
    expect(s.matriz).toEqual(matrizPadrao())
    expect(s.config).toEqual(configuracoesPadrao())
    expect(hadEq(calls, 'gestao_settings', 'tenant_id')).toBe(true)
  })

  test('erro de leitura NÃO cai no padrão: a matriz salva pode ser mais restrita que a padrão', async () => {
    const { client } = fakeSupabase({ gestao_settings: { data: null, error: { message: 'boom' } } })
    await expect(lerSettings(client, T)).rejects.toBeTruthy()
  })

  test('matriz salva: célula inválida volta ao padrão e as travas do Dono são forçadas', () => {
    const salva = { ...matrizPadrao(), valores: { corretor: 'sim', recepcao: 'talvez', juridico: 'nao', dono: 'sim' }, admin: { corretor: 'nao', recepcao: 'nao', juridico: 'nao', dono: 'nao' }, inventada: {} }
    const m = matrizDoBanco(salva)
    expect(m.valores).toEqual({ corretor: 'sim', recepcao: 'nao', juridico: 'nao', dono: 'sim' })
    expect(m.admin.dono).toBe('sim')
    expect(Object.keys(m)).not.toContain('inventada')
  })

  test('config salva inválida volta ao padrão', () => {
    expect(configDoBanco({ comissaoPct: 500 })).toEqual(configuracoesPadrao())
    expect(configDoBanco({ ...configuracoesPadrao(), comissaoPct: 6 }).comissaoPct).toBe(6)
  })

  test('gravarMatriz grava na linha do tenant', async () => {
    const { client, calls } = fakeSupabase({ gestao_settings: { data: null, error: null } })
    await gravarMatriz(client, T, matrizPadrao())
    const up = calls.find((c) => c.table === 'gestao_settings' && c.method === 'upsert')!
    expect((up.args[0] as { tenant_id: string }).tenant_id).toBe(T)
  })
})

describe('gestao-evento.repository', () => {
  test('registrarEvento grava no tenant', async () => {
    const { client, calls } = fakeSupabase({ gestao_eventos: { data: null, error: null } })
    await registrarEvento(client, T, { atorUserId: 'u1', atorNome: 'Ana', acao: 'Convidou', alvoTipo: 'membro', alvoId: 'm2' })
    const ins = calls.find((c) => c.table === 'gestao_eventos' && c.method === 'insert')!
    expect(ins.args[0]).toMatchObject({ tenant_id: T, ator_user_id: 'u1', alvo_tipo: 'membro' })
  })

  test('listarEventos: escopo, filtro por pessoa e datas inclusivas no fuso de Brasília', async () => {
    const { client, calls } = fakeSupabase({
      gestao_eventos: {
        data: [{ id: 7, tenant_id: T, ator_user_id: 'u1', ator_nome: 'Ana', acao: 'x', alvo_tipo: 'venda', alvo_id: 'V-1', quando: '2026-11-17T12:00:00+00:00' }],
        error: null,
      },
    })
    const ev = await listarEventos(client, T, { quem: 'Ana', de: '2026-11-01', ate: '2026-11-17' })
    expect(ev[0]).toEqual({ id: '7', atorUserId: 'u1', atorNome: 'Ana', acao: 'x', alvoTipo: 'venda', alvoId: 'V-1', quando: '2026-11-17T12:00:00+00:00' })
    expect(hadEq(calls, 'gestao_eventos', 'tenant_id')).toBe(true)
    expect(calls).toContainEqual({ table: 'gestao_eventos', method: 'eq', args: ['ator_nome', 'Ana'] })
    expect(calls).toContainEqual({ table: 'gestao_eventos', method: 'gte', args: ['quando', '2026-11-01T00:00:00-03:00'] })
    expect(calls).toContainEqual({ table: 'gestao_eventos', method: 'lt', args: ['quando', '2026-11-18T00:00:00-03:00'] })
  })

  test('data malformada no filtro é 422, não vira texto dentro da query', async () => {
    const { client } = fakeSupabase({})
    await expect(listarEventos(client, T, { de: "2026-11-01'or'1" })).rejects.toMatchObject({ statusCode: 422 })
  })
})

describe('regras de membro (puras)', () => {
  const dono = { userId: 'u-dono', perfil: 'dono' as const }
  const juridico = { userId: 'u-jur', perfil: 'juridico' as const }

  test('o perfil de quem convida é teto: só Dono convida Dono', () => {
    expect(regraConvite(juridico.perfil, 'dono')).toMatch(/Dono/)
    expect(regraConvite(dono.perfil, 'dono')).toBeNull()
    expect(regraConvite(juridico.perfil, 'corretor')).toBeNull()
  })

  test('ninguém muda o próprio perfil', () => {
    expect(regraAlterarMembro({ ator: dono, alvo: { userId: 'u-dono', perfil: 'dono' }, novoPerfil: 'recepcao', donosAtivos: 3 })).toBeTruthy()
  })

  test('só Dono concede ou tira o perfil Dono', () => {
    expect(regraAlterarMembro({ ator: juridico, alvo: { userId: 'x', perfil: 'corretor' }, novoPerfil: 'dono', donosAtivos: 1 })).toBeTruthy()
    expect(regraAlterarMembro({ ator: juridico, alvo: { userId: 'x', perfil: 'dono' }, novoPerfil: 'recepcao', donosAtivos: 2 })).toBeTruthy()
  })

  test('o último Dono ativo não é rebaixado nem removido', () => {
    expect(regraAlterarMembro({ ator: dono, alvo: { userId: 'x', perfil: 'dono' }, novoPerfil: 'recepcao', donosAtivos: 1 })).toMatch(/pelo menos um Dono/)
    expect(regraRemoverMembro({ ator: dono, alvo: { userId: 'x', perfil: 'dono' }, donosAtivos: 1 })).toMatch(/pelo menos um Dono/)
    expect(regraRemoverMembro({ ator: dono, alvo: { userId: 'x', perfil: 'dono' }, donosAtivos: 2 })).toBeNull()
  })

  test('convite pendente de Dono não conta como Dono ativo, e pode ser revogado', () => {
    expect(regraRemoverMembro({ ator: dono, alvo: { userId: null, perfil: 'dono' }, donosAtivos: 1 })).toBeNull()
  })

  test('ninguém remove o próprio acesso', () => {
    expect(regraRemoverMembro({ ator: dono, alvo: { userId: 'u-dono', perfil: 'dono' }, donosAtivos: 2 })).toBeTruthy()
  })
})

describe('payloads da tela (validados no servidor)', () => {
  test('matriz: tirar admin do Dono é recusado, como na tela', () => {
    const m = matrizPadrao()
    const r = validarMatrizPedido({ ...m, admin: { ...m.admin, dono: 'nao' } })
    expect(r.ok).toBe(false)
  })

  test('matriz: estado que a chave não admite é recusado (criar não tem «só os próprios»)', () => {
    const m = matrizPadrao()
    expect(validarMatrizPedido({ ...m, criar: { ...m.criar, corretor: 'proprio' } }).ok).toBe(false)
  })

  test('matriz: célula faltando é recusada (não vira padrão calado)', () => {
    const m = matrizPadrao() as Record<string, unknown>
    delete m.valores
    expect(validarMatrizPedido(m).ok).toBe(false)
  })

  test('matriz válida passa e chave inventada não entra', () => {
    const r = validarMatrizPedido({ ...matrizPadrao(), inventada: { dono: 'sim' } })
    expect(r.ok).toBe(true)
    if (r.ok) expect(Object.keys(r.matriz)).not.toContain('inventada')
  })

  test('config: percentual fora de 0..100 é recusado', () => {
    expect(validarConfigPedido({ ...configuracoesPadrao(), comissaoPct: 101 }).ok).toBe(false)
    expect(validarConfigPedido(configuracoesPadrao()).ok).toBe(true)
  })

  test('corretor exige corretor cadastrado; outros perfis descartam o corretor do body', () => {
    expect(() => perfilECorretorDoPedido({ perfil: 'corretor' })).toThrow(expect.objectContaining({ statusCode: 422 }))
    expect(perfilECorretorDoPedido({ perfil: 'dono', brokerId: '7f1e7c5e-0b7a-4a39-9b0e-6f0f3a6c2d11' })).toEqual({ perfil: 'dono', brokerId: null })
    expect(() => perfilECorretorDoPedido({ perfil: 'admin' })).toThrow(expect.objectContaining({ statusCode: 422 }))
  })
})
