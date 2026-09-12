import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import {
  getContractForClient,
  listContractsForClient,
} from '~~/server/repositories/contract.repository'
import { fakeSupabase, hadEq } from '../helpers/fake-supabase'

/**
 * Guardrail do payload do PORTAL.
 *
 * O QA do card 2.2 pede para conferir o JSON cru, não a tela — porque tela que
 * não renderiza um campo continua enviando o campo, e quem abre o DevTools é
 * justamente quem não deveria ver. Estes testes conferem o objeto que sai do
 * repositório, que é literalmente o corpo da resposta (os dois handlers de
 * `/api/portal/contracts*` devolvem o retorno sem tocar nele).
 *
 * Duas camadas, como no guardrail público:
 *  1. comportamental — mesmo que a query traga lixo interno, o modelo não o
 *     carrega, porque `toContractForClient` monta campo a campo;
 *  2. estática — nenhum handler de portal alcança `contract_internal`.
 */

const PORTAL_USER = 'pu-1'

/** Chaves que NUNCA podem aparecer na resposta do portal. */
const CHAVES_PROIBIDAS = [
  // Internos da imobiliária (moram em contract_internal).
  'notes',
  'admin_fee_percent',
  'adminFeePercent',
  'external_id',
  'externalId',
  // Detalhe de implementação: não dizem nada a um inquilino e revelam a
  // estrutura multitenant para quem estiver olhando.
  'tenant_id',
  'tenantId',
  'property_id',
  'propertyId',
  'source',
]

/**
 * Row de contrato JÁ CONTAMINADA com o que não pode sair.
 *
 * O embed de `contract_internal` está aqui de propósito: simula alguém trocando
 * o `select('role, contracts(*)')` por um que puxe a tabela interna junto. Se
 * o mapper um dia virar um spread, este teste quebra.
 */
function contractRowSuja(over: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    tenant_id: 't1',
    code: 'AUR-001',
    property_id: 'imovel-123',
    address_label: 'Rua das Acácias, 250',
    status: 'ativo',
    started_on: '2026-03-01',
    ends_on: '2028-02-29',
    rent_amount: 2400,
    due_day: 10,
    adjustment_index: 'igpm',
    source: 'manual',
    created_at: '2026-03-01T00:00:00.000Z',
    updated_at: '2026-03-01T00:00:00.000Z',
    notes: 'Cliente atrasou em agosto. Cobrar por telefone.',
    admin_fee_percent: 10,
    external_id: 'ERP-9988',
    ...over,
  }
}

function chavesDe(obj: unknown): string[] {
  return JSON.stringify(obj).match(/"([^"]+)":/g)?.map((k) => k.slice(1, -2)) ?? []
}

describe('resposta do portal não carrega campo interno', () => {
  test('listContractsForClient devolve só o que é do cliente', async () => {
    const { client } = fakeSupabase({
      contract_parties: { data: [{ role: 'inquilino', contracts: contractRowSuja() }], error: null },
    })

    const contratos = await listContractsForClient(client, PORTAL_USER)
    const chaves = chavesDe(contratos)

    for (const proibida of CHAVES_PROIBIDAS) {
      expect(chaves, `vazou "${proibida}" na listagem`).not.toContain(proibida)
    }
    // E o que DEVE sair continua saindo — guardrail que só remove vira tela vazia.
    expect(chaves).toEqual(
      expect.arrayContaining(['id', 'code', 'addressLabel', 'status', 'rentAmount', 'dueDay', 'roles']),
    )
  })

  test('getContractForClient devolve só o que é do cliente', async () => {
    const { client } = fakeSupabase({
      contract_parties: { data: [{ role: 'proprietario', contracts: contractRowSuja() }], error: null },
    })

    const contrato = await getContractForClient(client, PORTAL_USER, 'c1')
    const chaves = chavesDe(contrato)

    for (const proibida of CHAVES_PROIBIDAS) {
      expect(chaves, `vazou "${proibida}" no detalhe`).not.toContain(proibida)
    }
    expect(contrato?.roles).toEqual(['proprietario'])
  })

  test('o texto da anotação interna não aparece em lugar nenhum do JSON', async () => {
    // Checar a chave não basta: um mapper que renomeasse `notes` para
    // `observacao` passaria no teste acima e continuaria vazando o conteúdo.
    const { client } = fakeSupabase({
      contract_parties: { data: [{ role: 'inquilino', contracts: contractRowSuja() }], error: null },
    })

    const contrato = await getContractForClient(client, PORTAL_USER, 'c1')

    expect(JSON.stringify(contrato)).not.toContain('Cobrar por telefone')
    expect(JSON.stringify(contrato)).not.toContain('ERP-9988')
  })
})

describe('escopo das consultas do portal', () => {
  test('getContractForClient filtra por portal_user_id E por contract_id', async () => {
    const { client, calls } = fakeSupabase({
      contract_parties: { data: [{ role: 'inquilino', contracts: contractRowSuja() }], error: null },
    })

    await getContractForClient(client, PORTAL_USER, 'c1')

    expect(hadEq(calls, 'contract_parties', 'portal_user_id')).toBe(true)
    expect(hadEq(calls, 'contract_parties', 'contract_id')).toBe(true)
  })

  test('contrato de outra pessoa devolve null, não o contrato', async () => {
    // Sem vínculo não há linha em contract_parties. O handler transforma isso
    // em 404 — o MESMO 404 de contrato inexistente, de propósito.
    const { client } = fakeSupabase({ contract_parties: { data: [], error: null } })

    expect(await getContractForClient(client, PORTAL_USER, 'c-alheio')).toBeNull()
  })

  test('vínculo sem contrato legível devolve null (entitlement desligado)', async () => {
    // A RLS do contrato recusa e o embed volta nulo. Vínculo sozinho não é
    // autorização — o portal suspenso não pode mostrar meio contrato.
    const { client } = fakeSupabase({
      contract_parties: { data: [{ role: 'inquilino', contracts: null }], error: null },
    })

    expect(await getContractForClient(client, PORTAL_USER, 'c1')).toBeNull()
  })

  test('dois papéis no mesmo contrato viram uma linha só', async () => {
    const { client } = fakeSupabase({
      contract_parties: {
        data: [
          { role: 'inquilino', contracts: contractRowSuja() },
          { role: 'fiador', contracts: contractRowSuja() },
        ],
        error: null,
      },
    })

    const contrato = await getContractForClient(client, PORTAL_USER, 'c1')
    expect(contrato?.roles).toEqual(['inquilino', 'fiador'])
  })

  test('contrato encerrado continua acessível, marcado como encerrado', async () => {
    // Histórico: a pessoa saiu do imóvel mas ainda precisa dos recibos para o
    // imposto de renda. Encerrar não é apagar.
    const { client } = fakeSupabase({
      contract_parties: {
        data: [{ role: 'inquilino', contracts: contractRowSuja({ status: 'encerrado' }) }],
        error: null,
      },
    })

    const contrato = await getContractForClient(client, PORTAL_USER, 'c1')
    expect(contrato?.status).toBe('encerrado')
  })
})

describe('nenhum handler de portal alcança a tabela interna', () => {
  test('server/api/portal/** não menciona contract_internal nem getContractInternal', () => {
    const dir = join(process.cwd(), 'server/api/portal')
    const arquivos = ['contracts.get.ts', 'contracts/[id].get.ts', 'me.get.ts']

    for (const arquivo of arquivos) {
      const fonte = readFileSync(join(dir, arquivo), 'utf8')
      expect(fonte, `${arquivo} toca a tabela interna`).not.toMatch(/contract_internal/)
      expect(fonte, `${arquivo} chama a leitura interna`).not.toMatch(/getContractInternal/)
    }
  })
})
