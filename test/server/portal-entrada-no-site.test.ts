import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import {
  isPortalVisibleFor,
  portalEntitlementFor,
} from '~~/server/repositories/tenant-feature.repository'
import { fakeSupabase, hadEq } from '../helpers/fake-supabase'

/**
 * A porta de entrada da Área do Cliente no site público.
 *
 * O link só aparece para quem contratou. Não é preciosismo comercial: um link
 * que leva a um login que recusa a pessoa é pior do que link nenhum, porque ela
 * não conclui "não tenho acesso" — ela conclui "o site está quebrado" e liga
 * para a imobiliária.
 *
 * Carência conta como visível pelo mesmo motivo que conta no login: o cliente
 * final não pode ser o primeiro a saber que a imobiliária atrasou um pagamento.
 */

const TENANT = 't1'

describe('entitlement que decide se o link existe', () => {
  test('a consulta é escopada por tenant e por feature', async () => {
    const { client, calls } = fakeSupabase({
      tenant_features: { data: { enabled: true, grace_until: null }, error: null },
    })

    await portalEntitlementFor(client, TENANT)

    expect(hadEq(calls, 'tenant_features', 'tenant_id')).toBe(true)
    expect(hadEq(calls, 'tenant_features', 'feature')).toBe(true)
  })

  test('plano ativo mostra o link', async () => {
    const { client } = fakeSupabase({
      tenant_features: { data: { enabled: true, grace_until: null }, error: null },
    })
    expect(await isPortalVisibleFor(client, TENANT)).toBe(true)
  })

  test('sem linha nenhuma, não mostra', async () => {
    // Ausência de linha é DESLIGADO, igual ao banco. É o default que permite
    // subir o portal em produção sem ligar para ninguém.
    const { client } = fakeSupabase({ tenant_features: { data: null, error: null } })
    expect(await isPortalVisibleFor(client, TENANT)).toBe(false)
  })

  test('desligado e fora da carência, não mostra', async () => {
    const { client } = fakeSupabase({
      tenant_features: { data: { enabled: false, grace_until: '2020-01-01' }, error: null },
    })
    expect(await isPortalVisibleFor(client, TENANT)).toBe(false)
  })

  test('dentro da carência, ainda mostra', async () => {
    const { client } = fakeSupabase({
      tenant_features: { data: { enabled: false, grace_until: '2999-12-31' }, error: null },
    })
    expect(await isPortalVisibleFor(client, TENANT)).toBe(true)
  })

  test('falha na leitura não mostra o link', async () => {
    // Fail-closed: banco fora não pode virar link para um portal que talvez
    // recuse a pessoa. É o oposto da escolha do robots.txt, e de propósito — lá
    // o risco é desindexar o site de um cliente real; aqui é só um link a menos.
    const client = {
      from: () => {
        throw new Error('conexão caiu')
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
    expect(await isPortalVisibleFor(client, TENANT)).toBe(false)
  })
})

describe('o link está nas duas pontas do site', () => {
  test.each([
    ['app/components/AppHeader.vue', 'header'],
    ['app/components/AppFooter.vue', 'rodapé'],
  ])('%s tem o link, condicionado ao entitlement', (arquivo) => {
    const fonte = readFileSync(join(process.cwd(), arquivo), 'utf8')
    expect(fonte).toMatch(/area-cliente/)
    expect(fonte, 'link sem condição de entitlement').toMatch(/portalEnabled/)
  })
})

describe('o modelo público nasce fechado', () => {
  test('o mapper do tenant não inventa entitlement', () => {
    // `portalEnabled` não vem da linha de `tenants`. Se o mapper um dia passar a
    // devolver `true` por default, todo site da plataforma ganha um link para um
    // portal que a maioria não contratou.
    const fonte = readFileSync(join(process.cwd(), 'server/mappers/tenant.mapper.ts'), 'utf8')
    expect(fonte).toMatch(/portalEnabled:\s*false/)
  })
})
