import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import {
  listActiveProperties,
  listActivePropertyCards,
  getPropertyByCode,
  getPropertyByCodeWithBrokerPhone,
} from '~~/server/repositories/property.repository'
import { getTenantBySlug } from '~~/server/repositories/tenant.repository'
import { fakeSupabase } from '../helpers/fake-supabase'

/**
 * Guardrail do payload público.
 *
 * Antes, quem barrava coluna interna numa leitura pública era o BANCO: o papel
 * anon tem GRANT SELECT só nas colunas públicas de `properties`, então um
 * `select('*')` quebrava alto com "permission denied". Com as leituras públicas
 * passando pela service_role (que tem BYPASSRLS e enxerga tudo), esse grito
 * desapareceu — e foi por aí que `updated_by` foi para o JSON público.
 *
 * Estes testes recolocam a checagem na aplicação, em duas camadas:
 *  1. comportamental — o modelo devolvido não carrega coluna interna, não
 *     importa o que a query tenha trazido;
 *  2. estática — leitura pública não usa `select('*')`, com exceções nomeadas.
 *
 * A camada 2 é redundante por design: se a 1 já garante o payload, a 2 é o que
 * faz a revisão perceber o problema antes de rodar. "Do not depend on any
 * single control" (OWASP Authorization Cheat Sheet).
 */

/** Colunas que NUNCA podem sair numa resposta pública, por tabela. */
const INTERNAL_PROPERTY_COLUMNS = ['location', 'broker_id', 'owner_name', 'owner_phone', 'updated_by']
const INTERNAL_MODEL_KEYS = ['location', 'brokerId', 'broker', 'ownerName', 'ownerPhone', 'updatedBy']

/** Row de imóvel COM todas as colunas internas preenchidas — o pior caso. */
function fullPropertyRow(over: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    tenant_id: 't1',
    code: 'NC-0231',
    title: 'Casa no Centro',
    type: 'casa',
    purpose: 'venda',
    price: 350000,
    neighborhood: 'Centro',
    city: 'Três Lagoas',
    state: 'MS',
    bedrooms: 3,
    suites: 1,
    bathrooms: 2,
    parking: 2,
    area: 180,
    high_standard: false,
    description: 'Imóvel bem localizado',
    features: ['quintal'],
    status: 'active',
    featured: false,
    created_at: '2026-08-21T10:00:00.000Z',
    updated_at: '2026-08-21T10:00:00.000Z',
    location: 'Rua Secreta, 123',
    broker_id: 'b1',
    owner_name: 'Dono Silva',
    owner_phone: '5567999990000',
    updated_by: 'uuid-do-funcionario',
    property_images: [],
    ...over,
  }
}

const brokerRow = {
  id: 'b1',
  tenant_id: 't1',
  name: 'Ana',
  phone: '5567999991111',
  email: 'ana@exemplo.com',
  creci: '12345',
  active: true,
}

/** Leituras públicas de imóvel: qualquer visitante do site chega nelas. */
const PUBLIC_PROPERTY_READS: { name: string; run: (client: never) => Promise<unknown> }[] = [
  { name: 'listActiveProperties', run: (c) => listActiveProperties(c, 't1') },
  { name: 'listActivePropertyCards', run: (c) => listActivePropertyCards(c, 't1') },
  { name: 'getPropertyByCode', run: (c) => getPropertyByCode(c, 't1', 'NC-0231') },
  { name: 'getPropertyByCodeWithBrokerPhone', run: (c) => getPropertyByCodeWithBrokerPhone(c, 't1', 'NC-0231') },
]

describe('payload público de imóvel', () => {
  for (const { name, run } of PUBLIC_PROPERTY_READS) {
    test(`${name} não devolve coluna interna, mesmo com a row completa`, async () => {
      const { client } = fakeSupabase({
        properties: { data: [fullPropertyRow()], error: null },
        brokers: { data: [brokerRow], error: null },
      })

      const result = await run(client as never)
      const models = Array.isArray(result) ? result : [result]

      expect(models.length).toBeGreaterThan(0)
      for (const model of models) {
        const keys = Object.keys(model as Record<string, unknown>)
        const vazando = keys.filter((k) => INTERNAL_MODEL_KEYS.includes(k))
        expect(vazando, `${name} vazou: ${vazando.join(', ')}`).toEqual([])
      }
    })
  }

  // O telefone do captador é a única exceção deliberada: é dado interno que o
  // site publica de propósito, e só o telefone — nunca o resto do cadastro.
  test('brokerPhone é a única informação de corretor que chega ao site', async () => {
    const { client } = fakeSupabase({
      properties: { data: [fullPropertyRow()], error: null },
      brokers: { data: [brokerRow], error: null },
    })

    const [card] = await listActivePropertyCards(client, 't1')

    expect(card?.brokerPhone).toBe('5567999991111')
    expect(JSON.stringify(card)).not.toContain('ana@exemplo.com')
    expect(JSON.stringify(card)).not.toContain('12345')
  })
})

describe('payload público de tenant', () => {
  test('getTenantBySlug não devolve updated_by', async () => {
    const { client } = fakeSupabase({
      tenants: {
        data: [
          {
            id: 't1',
            slug: 'tres-lagoas',
            name: 'Imóveis Exemplo',
            active: true,
            updated_by: 'uuid-do-funcionario',
          },
        ],
        error: null,
      },
    })

    const tenant = await getTenantBySlug(client, 'tres-lagoas')

    expect(Object.keys(tenant ?? {})).not.toContain('updatedBy')
  })
})

// ---------------------------------------------------------------------------

/**
 * Funções que podem usar `select('*')`, com o motivo. Lista de exceções: uma
 * função nova cai no teste por padrão ("deny by default", OWASP), e incluí-la
 * aqui é um ato consciente que aparece na revisão.
 */
const SELECT_ALL_PERMITIDO: Record<string, string> = {
  // Painel — só se chega nelas depois de `requireTenantMember`.
  attachBrokersAdmin: 'painel',
  listAllProperties: 'painel',
  getPropertyById: 'painel',
  createProperty: 'painel (releitura pós-insert)',
  updateProperty: 'painel (releitura pós-update)',
  listBrokers: 'painel',
  getBroker: 'painel',
  createBroker: 'painel',
  updateBroker: 'painel',
  updateTenantSettings: 'painel',
  getMembership: 'painel',
  listLeads: 'painel',
  createLead: 'gravação, não leitura pública',
  createManualLead: 'painel',
  updateLead: 'painel',
  listMembers: 'painel',
  inviteMember: 'painel',
  // Compartilhada entre site e painel: o site só lê `.phone` do resultado, e o
  // teste comportamental acima prova que o resto não chega ao payload.
  fetchBrokersById: 'helper compartilhado, coberto pelo teste de payload',
  // Públicas: `tenants` não tem privacidade por coluna (o anon tem SELECT na
  // tabela inteira), então aqui `*` não muda nada — quem protege é o mapper, e
  // o teste de payload acima cobre isso.
  getTenantByDomain: 'público, coberto pelo teste de payload de tenant',
  getTenantBySlug: 'público, coberto pelo teste de payload de tenant',
}

/** Remove comentários: `select('*')` citado em doc comment não conta. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

/** Nomes das funções do arquivo que chamam `.select('*')` / `.select(`*, ...`)`. */
function functionsUsingSelectAll(source: string): string[] {
  const code = stripComments(source)
  const bounds: { name: string; start: number }[] = []
  const fnRe = /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g
  let m: RegExpExecArray | null
  while ((m = fnRe.exec(code))) bounds.push({ name: m[1]!, start: m.index })

  return bounds
    .filter(({ start }, i) => {
      const body = code.slice(start, bounds[i + 1]?.start ?? code.length)
      return /\.select\(\s*['"`]\s*\*/.test(body)
    })
    .map(({ name }) => name)
}

describe('leitura pública não usa select(*)', () => {
  const repos = ['property', 'broker', 'tenant', 'lead', 'member']

  for (const repo of repos) {
    test(`${repo}.repository: todo select(*) é declarado`, () => {
      const source = readFileSync(join(process.cwd(), `server/repositories/${repo}.repository.ts`), 'utf8')

      const naoDeclaradas = functionsUsingSelectAll(source).filter((fn) => !(fn in SELECT_ALL_PERMITIDO))

      expect(
        naoDeclaradas,
        `usa select('*') sem estar em SELECT_ALL_PERMITIDO: ${naoDeclaradas.join(', ')}. ` +
          `Se for leitura pública, troque por lista de colunas explícita.`,
      ).toEqual([])
    })
  }

  test('o detector realmente acha select(*) — senão o teste acima passa vazio', () => {
    const source = `
      export async function comSelectAll(c) { return c.from('t').select('*') }
      export async function comColunas(c) { return c.from('t').select('id, code') }
      /** Doc comment citando select('*') não conta. */
      export async function soComentario(c) { return c.from('t').select('id') }
    `

    expect(functionsUsingSelectAll(source)).toEqual(['comSelectAll'])
  })
})
