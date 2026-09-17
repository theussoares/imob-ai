import { describe, expect, test } from 'vitest'
import { fakeSupabase } from '../helpers/fake-supabase'
import type { ContractPartyRole, PortalDocCategory } from '~~/shared/models/portal'
import { PORTAL_DOC_CATEGORIES } from '~~/shared/models/portal'
import {
  canClientSeeDocument,
  defaultAudienceFor,
  recursoAtivo,
  visibleDocumentsFor,
} from '~~/shared/utils/portal-access'
import {
  getContractForClient,
  listContractsForClient,
} from '~~/server/repositories/contract.repository'
import { listDocumentsForClient } from '~~/server/repositories/portal-document.repository'

/**
 * Isolamento entre clientes — card 3.1.
 *
 * "A garantia de que um cliente nunca alcança o documento de outro. É o risco
 * que mata o produto: um vazamento aqui não é bug, é incidente com dado pessoal
 * e financeiro."
 *
 * ⚠️ **O QUE ESTA SUÍTE NÃO PROVA.** Ela roda contra o fake do Supabase, então
 * prova o que o CÓDIGO faz — não o que o BANCO faz, e é o banco que isola. Em
 * 16/09 uma migration ia recriar as policies do portal no formato antigo,
 * reintroduzindo uma recursão infinita que derruba o portal inteiro; esta suíte
 * teria passado verde, porque lê a pasta e não o banco.
 *
 * A prova que falta mora em `supabase/tests/isolamento-portal.sql`, que roda
 * contra as policies reais personificando clientes de verdade. As duas se
 * complementam e nenhuma substitui a outra.
 *
 * Aqui o alvo é diferente e igualmente necessário: o caminho do DOWNLOAD
 * ASSINADO, que não passa por RLS de tabela, e a regra de audiência aplicada em
 * TypeScript — que é a única barreira quando o chamador usa service role.
 */

const TENANT = 'tenant-olmi'
const PUBLICADO = '2026-09-16T12:00:00.000Z'

const INQUILINO = 'pu-giane'
const PROPRIETARIO = 'pu-thiago'
const FIADOR = 'pu-fiador'

function doc(over: Record<string, unknown> = {}) {
  return {
    id: 'doc-1',
    tenant_id: TENANT,
    contract_id: 'ct-1',
    category: 'contrato',
    title: 'documento',
    competence: null,
    due_on: null,
    amount: null,
    storage_path: 'olmi/ct-1/a.pdf',
    mime: 'application/pdf',
    size_bytes: 1,
    audience: ['inquilino', 'proprietario', 'fiador'],
    published_at: PUBLICADO,
    created_by: null,
    created_at: PUBLICADO,
    ...over,
  }
}

// ---------------------------------------------------------------------------
// A matriz: quem vê o quê, por categoria
// ---------------------------------------------------------------------------

describe('matriz de audiência — categoria x papel', () => {
  /**
   * O que CADA papel deve ver de CADA categoria, com o default do sistema.
   * Escrito à mão de propósito: derivar de `defaultAudienceFor` faria o teste
   * concordar consigo mesmo e não com a intenção.
   */
  const ESPERADO: Record<PortalDocCategory, ContractPartyRole[]> = {
    contrato: ['inquilino', 'proprietario', 'fiador'],
    contrato_administracao: ['proprietario'],
    vistoria: ['inquilino', 'proprietario', 'fiador'],
    boleto: ['inquilino'],
    recibo: ['inquilino'],
    extrato: ['proprietario'],
    outro: ['inquilino', 'proprietario'],
  }

  const TODOS: ContractPartyRole[] = ['inquilino', 'proprietario', 'fiador']

  test('a matriz cobre todas as categorias do enum', () => {
    // Categoria nova sem linha aqui passaria sem ninguém decidir quem a vê.
    for (const c of PORTAL_DOC_CATEGORIES) {
      expect(ESPERADO[c], `categoria ${c} fora da matriz`).toBeTruthy()
    }
    expect(Object.keys(ESPERADO).length).toBe(PORTAL_DOC_CATEGORIES.length)
  })

  for (const categoria of PORTAL_DOC_CATEGORIES) {
    for (const papel of TODOS) {
      const deveVer = ESPERADO[categoria].includes(papel)
      test(`${papel} ${deveVer ? 'VE' : 'NAO ve'} ${categoria}`, () => {
        const audiencia = defaultAudienceFor(categoria)
        expect(canClientSeeDocument({ audience: audiencia, publishedAt: PUBLICADO }, [papel])).toBe(
          deveVer,
        )
      })
    }
  }

  test('os dois vazamentos que o plano nomeia estão fechados', () => {
    // "O proprietário vendo os dados de pagamento de quem mora no imóvel" e o
    // espelho dele.
    expect(
      canClientSeeDocument({ audience: defaultAudienceFor('boleto'), publishedAt: PUBLICADO }, [
        'proprietario',
      ]),
    ).toBe(false)
    expect(
      canClientSeeDocument({ audience: defaultAudienceFor('extrato'), publishedAt: PUBLICADO }, [
        'inquilino',
      ]),
    ).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Lista, detalhe e download — os três caminhos
// ---------------------------------------------------------------------------

describe('lista de documentos', () => {
  test('cliente A não recebe documento endereçado a B', async () => {
    const { client } = fakeSupabase({
      portal_documents: {
        data: [
          doc({ id: 'do-inquilino', category: 'recibo', audience: ['inquilino'] }),
          doc({ id: 'do-dono', category: 'extrato', audience: ['proprietario'] }),
          doc({ id: 'de-ambos', category: 'contrato' }),
        ],
        error: null,
      },
    })

    const doInquilino = await listDocumentsForClient(client, TENANT, 'ct-1', ['inquilino'])
    expect(doInquilino.map((d) => d.id).sort()).toEqual(['de-ambos', 'do-inquilino'])
  })

  test('sem papel no contrato a lista é vazia e o banco nem é consultado', async () => {
    const { client, calls } = fakeSupabase({
      portal_documents: { data: [doc()], error: null },
    })
    expect(await listDocumentsForClient(client, TENANT, 'ct-1', [])).toEqual([])
    expect(calls).toEqual([])
  })

  test('rascunho não sai nem para quem é do contrato', async () => {
    const { client } = fakeSupabase({
      portal_documents: { data: [doc({ published_at: null })], error: null },
    })
    expect(await listDocumentsForClient(client, TENANT, 'ct-1', ['inquilino'])).toEqual([])
  })
})

describe('contratos', () => {
  function contrato(partes: { role: string; portal_user_id: string }[]) {
    return {
      id: 'ct-1',
      tenant_id: TENANT,
      code: 'LOC-001',
      property_id: null,
      address_label: 'Rua X, 1',
      status: 'ativo',
      started_on: null,
      ends_on: null,
      rent_amount: 3000,
      due_day: 11,
      adjustment_index: null,
      source: 'manual',
      created_at: PUBLICADO,
      updated_at: PUBLICADO,
      contract_parties: partes,
    }
  }

  test('o papel do OUTRO não vira papel meu', async () => {
    // O embed do PostgREST traz as outras partes do mesmo contrato. Sem
    // refiltrar por portal_user_id, a inquilina herdaria 'proprietario' e
    // passaria a enxergar o extrato de repasse.
    const { client } = fakeSupabase({
      contracts: {
        data: [
          contrato([
            { role: 'inquilino', portal_user_id: INQUILINO },
            { role: 'proprietario', portal_user_id: PROPRIETARIO },
            { role: 'fiador', portal_user_id: FIADOR },
          ]),
        ],
        error: null,
      },
    })

    const [c] = await listContractsForClient(client, TENANT, INQUILINO)
    expect(c?.roles).toEqual(['inquilino'])
  })

  test('contrato de outra pessoa devolve null, não 403', async () => {
    // 403 confirmaria que o contrato existe para quem trocou o id na URL.
    const { client } = fakeSupabase({
      contracts: {
        data: contrato([{ role: 'proprietario', portal_user_id: PROPRIETARIO }]),
        error: null,
      },
    })
    expect(await getContractForClient(client, TENANT, INQUILINO, 'ct-1')).toBeNull()
  })

  test('a resposta do cliente não carrega campo interno', async () => {
    const { client } = fakeSupabase({
      contracts: {
        data: [contrato([{ role: 'inquilino', portal_user_id: INQUILINO }])],
        error: null,
      },
    })
    const [c] = await listContractsForClient(client, TENANT, INQUILINO)
    for (const proibido of ['tenantId', 'source', 'adjustmentIndex', 'notes', 'adminFeePercent']) {
      expect(Object.keys(c ?? {})).not.toContain(proibido)
    }
  })
})

describe('download assinado — o caminho sem RLS de tabela', () => {
  /**
   * Quando o chamador usa service role, `canClientSeeDocument` é a ÚNICA
   * barreira entre o inquilino e o extrato do proprietário. Estes casos são a
   * razão de ela ser função pura.
   */
  test('a regra recusa tudo que não for publicado + do papel certo', () => {
    const casos: [string, ContractPartyRole[], ContractPartyRole[], string | null, boolean][] = [
      ['papel certo, publicado', ['inquilino'], ['inquilino'], PUBLICADO, true],
      ['papel errado, publicado', ['proprietario'], ['inquilino'], PUBLICADO, false],
      ['papel certo, rascunho', ['inquilino'], ['inquilino'], null, false],
      ['sem papel algum', ['inquilino'], [], PUBLICADO, false],
      ['audiência vazia', [], ['inquilino'], PUBLICADO, false],
      ['acumula papéis, um bate', ['proprietario'], ['inquilino', 'proprietario'], PUBLICADO, true],
    ]

    for (const [nome, audience, roles, publishedAt, esperado] of casos) {
      expect(canClientSeeDocument({ audience, publishedAt }, roles), nome).toBe(esperado)
    }
  })

  test('filtrar lista usa exatamente a mesma regra do download', () => {
    // Lista e download discordando é o pior dos dois mundos: o cliente vê o
    // item e recebe erro ao clicar, ou não vê e baixa por URL direta.
    const docs = [
      { id: 'a', audience: ['inquilino'] as ContractPartyRole[], publishedAt: PUBLICADO },
      { id: 'b', audience: ['proprietario'] as ContractPartyRole[], publishedAt: PUBLICADO },
      { id: 'c', audience: ['inquilino'] as ContractPartyRole[], publishedAt: null },
    ]
    const visiveis = visibleDocumentsFor(docs, ['inquilino'])
    for (const d of docs) {
      expect(visiveis.includes(d), `divergência em ${d.id}`).toBe(
        canClientSeeDocument(d, ['inquilino']),
      )
    }
  })
})

describe('entitlement desligado fecha o acesso', () => {
  test('sem registro, com carência vencida ou desligado: fechado', () => {
    expect(recursoAtivo(null)).toBe(false)
    expect(recursoAtivo({ enabled: false, graceUntil: null })).toBe(false)
    expect(recursoAtivo({ enabled: false, graceUntil: '2020-01-01' })).toBe(false)
  })

  test('ligado ou em carência: aberto', () => {
    expect(recursoAtivo({ enabled: true, graceUntil: null })).toBe(true)
    expect(recursoAtivo({ enabled: false, graceUntil: '2099-01-01' })).toBe(true)
  })
})
