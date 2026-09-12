import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import {
  addContractParty,
  listContractParties,
  removeContractParty,
} from '~~/server/repositories/contract.repository'
import { assertContractInput, assertContractPartyInput } from '~~/server/utils/validate'
import { fakeSupabase, hadEq, touched } from '../helpers/fake-supabase'

/**
 * Card 1.1 — CRUD de contratos pelo painel.
 *
 * Dois assuntos convivem aqui, e os dois protegem a mesma coisa por caminhos
 * diferentes:
 *
 *  1. **escopo** — `contract_parties` e `contract_internal` NÃO têm `tenant_id`.
 *     O vínculo com a imobiliária passa pela FK para `contracts`, então cada
 *     operação confere o contrato antes de tocar na tabela. Vincular alguém a um
 *     contrato é conceder acesso: um id de contrato descoberto não pode virar
 *     participante em imobiliária alheia.
 *
 *  2. **mensagem** — os CHECKs da 0028 (dia 1–31, taxa 0–100) recusam com 23514,
 *     que chega na tela como erro 500 e faz a pessoa perder o formulário. A
 *     validação devolve 422 com o motivo escrito.
 */

const TENANT = 't1'
const CONTRACT = 'c1'

function contractRow(over: Record<string, unknown> = {}) {
  return {
    id: CONTRACT,
    tenant_id: TENANT,
    code: 'LOC-001',
    property_id: null,
    address_label: 'Rua das Acácias, 250',
    status: 'ativo',
    started_on: '2026-01-01',
    ends_on: '2027-01-01',
    rent_amount: 1850,
    due_day: 10,
    adjustment_index: 'igpm',
    source: 'manual',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...over,
  }
}

function partyRow(over: Record<string, unknown> = {}) {
  return {
    id: 'cp-1',
    contract_id: CONTRACT,
    portal_user_id: 'pu-1',
    role: 'inquilino',
    portal_users: { name: 'Ana Paula', email: 'ana@exemplo.invalid', active: true },
    ...over,
  }
}

describe('escopo por tenant nas partes do contrato', () => {
  test('listContractParties confere o contrato antes de ler as partes', async () => {
    const { client, calls } = fakeSupabase({
      contracts: { data: contractRow(), error: null },
      contract_parties: { data: [partyRow()], error: null },
    })

    await listContractParties(client, TENANT, CONTRACT)

    expect(hadEq(calls, 'contracts', 'tenant_id')).toBe(true)
    expect(hadEq(calls, 'contract_parties', 'contract_id')).toBe(true)
  })

  test('contrato de outra imobiliária devolve lista vazia e não consulta as partes', async () => {
    // O contrato não aparece para este tenant, então nem chegamos à tabela de
    // vínculos: quem tem o id de um contrato alheio não descobre quem está nele.
    const { client, calls } = fakeSupabase({ contracts: { data: null, error: null } })

    expect(await listContractParties(client, TENANT, 'c-alheio')).toEqual([])
    expect(touched(calls, 'contract_parties')).toBe(false)
  })

  test('addContractParty recusa contrato de outra imobiliária sem inserir nada', async () => {
    const { client, calls } = fakeSupabase({ contracts: { data: null, error: null } })

    await expect(
      addContractParty(client, TENANT, 'c-alheio', { portalUserId: 'pu-1', role: 'inquilino' }),
    ).rejects.toMatchObject({ statusCode: 404 })
    expect(touched(calls, 'contract_parties')).toBe(false)
  })

  test('addContractParty exige que a PESSOA também seja desta imobiliária', async () => {
    // O insert em contract_parties olha só para o contrato. Sem esta
    // conferência, um portalUserId de fora entraria na tabela — e vínculo é
    // acesso concedido.
    const { client, calls } = fakeSupabase({
      contracts: { data: contractRow(), error: null },
      portal_users: { data: null, error: null },
    })

    await expect(
      addContractParty(client, TENANT, CONTRACT, { portalUserId: 'pu-de-fora', role: 'inquilino' }),
    ).rejects.toMatchObject({ statusCode: 404 })
    expect(hadEq(calls, 'portal_users', 'tenant_id')).toBe(true)
    expect(touched(calls, 'contract_parties')).toBe(false)
  })

  test('removeContractParty filtra por contrato E por id do vínculo', async () => {
    const { client, calls } = fakeSupabase({
      contracts: { data: contractRow(), error: null },
      contract_parties: { data: null, error: null },
    })

    await removeContractParty(client, TENANT, CONTRACT, 'cp-1')

    expect(hadEq(calls, 'contract_parties', 'contract_id')).toBe(true)
    expect(hadEq(calls, 'contract_parties', 'id')).toBe(true)
  })
})

describe('vínculo duplicado e vínculo órfão', () => {
  test('mesma pessoa com o mesmo papel vira 409, não erro de servidor', async () => {
    // 23505 é unique_violation em (contract_id, portal_user_id, role). Isso é a
    // imobiliária clicando duas vezes, não falha do sistema.
    const { client } = fakeSupabase({
      contracts: { data: contractRow(), error: null },
      portal_users: { data: { id: 'pu-1' }, error: null },
      contract_parties: { data: null, error: { code: '23505' } },
    })

    await expect(
      addContractParty(client, TENANT, CONTRACT, { portalUserId: 'pu-1', role: 'inquilino' }),
    ).rejects.toMatchObject({ statusCode: 409 })
  })

  test('vínculo sem pessoa legível some da lista em vez de virar linha vazia', async () => {
    // O embed de portal_users vem nulo quando a RLS recusa. Mostrar "—" na tela
    // esconderia um problema de dado; o mapper devolve null e a lista descarta.
    const { client } = fakeSupabase({
      contracts: { data: contractRow(), error: null },
      contract_parties: { data: [partyRow({ portal_users: null })], error: null },
    })

    expect(await listContractParties(client, TENANT, CONTRACT)).toEqual([])
  })

  test('a lista sai na ordem inquilino → proprietário → fiador', async () => {
    // A ordem em que a imobiliária fala do contrato, não a de cadastro.
    const { client } = fakeSupabase({
      contracts: { data: contractRow(), error: null },
      contract_parties: {
        data: [
          partyRow({ id: 'cp-3', role: 'fiador' }),
          partyRow({ id: 'cp-2', role: 'proprietario' }),
          partyRow({ id: 'cp-1', role: 'inquilino' }),
        ],
        error: null,
      },
    })

    const partes = await listContractParties(client, TENANT, CONTRACT)
    expect(partes.map((p) => p.role)).toEqual(['inquilino', 'proprietario', 'fiador'])
  })
})

describe('validação do contrato — 422 com motivo, não 500 do CHECK', () => {
  const valido = { code: 'LOC-001', addressLabel: 'Rua A, 100' }

  test('aceita o payload mínimo', () => {
    expect(() => assertContractInput(valido)).not.toThrow()
  })

  test('código é obrigatório', () => {
    expect(() => assertContractInput({ ...valido, code: '  ' })).toThrow(
      expect.objectContaining({ statusCode: 422 }),
    )
  })

  test('sem imóvel do catálogo e sem endereço, o contrato não diz de que imóvel se trata', () => {
    expect(() => assertContractInput({ code: 'LOC-001' })).toThrow(
      expect.objectContaining({ statusCode: 422 }),
    )
    expect(() => assertContractInput({ code: 'LOC-001', propertyId: 'imovel-1' })).not.toThrow()
  })

  test.each([0, 32, 45, -1])('dia do vencimento %i é recusado', (dueDay) => {
    expect(() => assertContractInput({ ...valido, dueDay })).toThrow(
      expect.objectContaining({ statusCode: 422 }),
    )
  })

  test.each([1, 10, 31])('dia do vencimento %i passa', (dueDay) => {
    expect(() => assertContractInput({ ...valido, dueDay })).not.toThrow()
  })

  test.each([-1, 101, 150])('taxa de administração %i%% é recusada', (adminFeePercent) => {
    expect(() => assertContractInput({ ...valido, internal: { adminFeePercent } })).toThrow(
      expect.objectContaining({ statusCode: 422 }),
    )
  })

  test.each([0, 10, 100])('taxa de administração %i%% passa', (adminFeePercent) => {
    expect(() =>
      assertContractInput({ ...valido, internal: { adminFeePercent } }),
    ).not.toThrow()
  })

  test('campo opcional vazio não é tratado como zero inválido', () => {
    expect(() =>
      assertContractInput({ ...valido, dueDay: null, internal: { adminFeePercent: null } }),
    ).not.toThrow()
  })

  test('término antes do início é recusado', () => {
    // Passa pelo banco sem reclamar e só aparece meses depois, quando alguém
    // pergunta por que o contrato "já nasceu vencido".
    expect(() =>
      assertContractInput({ ...valido, startedOn: '2026-03-01', endsOn: '2026-02-01' }),
    ).toThrow(expect.objectContaining({ statusCode: 422 }))
  })

  test('situação fora do enum é recusada', () => {
    expect(() => assertContractInput({ ...valido, status: 'cancelado' })).toThrow(
      expect.objectContaining({ statusCode: 422 }),
    )
  })
})

describe('validação do vínculo', () => {
  test('papel fora do enum é recusado', () => {
    expect(() => assertContractPartyInput({ portalUserId: 'pu-1', role: 'sindico' })).toThrow(
      expect.objectContaining({ statusCode: 422 }),
    )
  })

  test('sem cliente escolhido é recusado', () => {
    expect(() => assertContractPartyInput({ portalUserId: '', role: 'inquilino' })).toThrow(
      expect.objectContaining({ statusCode: 422 }),
    )
  })
})

describe('os handlers de contrato usam o client do usuário, não service role', () => {
  test('server/api/admin/contracts** não menciona serviceSupabase', () => {
    /*
     * Decisão da 0028, e o oposto do que `properties` precisou fazer: os campos
     * internos do contrato moram em `contract_internal`, uma TABELA separada, em
     * vez de colunas com privilégio restrito. Sem privilégio por coluna, o
     * `select('*')` do repositório não tropeça e a RLS continua valendo.
     *
     * Trocar para service role aqui desligaria `contracts_member_write` e
     * `contract_parties_member_write` de uma vez, deixando o filtro por tenant
     * do repositório como barreira única — exatamente o que a 0028 evitou.
     */
    const dir = join(process.cwd(), 'server/api/admin')
    const arquivos = [
      'contracts.get.ts',
      'contracts.post.ts',
      'contracts/[id].get.ts',
      'contracts/[id].put.ts',
      'contracts/[id]/parties.post.ts',
      'contracts/[id]/parties/[partyId].delete.ts',
      'portal-users.get.ts',
    ]

    for (const arquivo of arquivos) {
      const fonte = readFileSync(join(dir, arquivo), 'utf8')
      expect(fonte, `${arquivo} usa service role`).not.toMatch(/serviceSupabase/)
      expect(fonte, `${arquivo} não exige membro do tenant`).toMatch(/requireTenantMember/)
    }
  })
})
