import { describe, expect, test } from 'vitest'
import { fakeSupabase } from '../helpers/fake-supabase'
import {
  setDocumentAudience,
  setDocumentPublished,
} from '~~/server/repositories/portal-document.repository'
import { setPortalUserActive } from '~~/server/repositories/portal-user.repository'
import { updateContract } from '~~/server/repositories/contract.repository'

/**
 * Update que não acerta linha nenhuma responde 404, não 500.
 *
 * O detalhe do PostgREST que produz o bug: `.single()` exige exatamente uma
 * linha e devolve `PGRST116` quando vêm zero. Como os repositórios fazem
 * `if (error) throw error`, o erro cru do Supabase sobe e o handler responde
 * **500** — para um fato que é banal e esperado.
 *
 * Dois caminhos reais chegam aqui, e o segundo é o que importa:
 *   - duas abas abertas no mesmo contrato: o documento é apagado numa e
 *     publicado na outra;
 *   - **id de outra imobiliária**. O filtro por `tenant_id` faz o update acertar
 *     zero linhas, que é o isolamento funcionando — e o isolamento funcionando
 *     não pode sair como erro de servidor. Um 500 ainda avisaria, a quem trocou
 *     o id, que ali existe algo diferente de um id inventado.
 *
 * O resto do portal já responde 404 para "não é seu" (`getContractForClient`, o
 * download). Estes quatro pontos eram a exceção.
 */

const TENANT = 't1'
const ID = '0f5f4d2e-0000-4000-8000-000000000001'

/** O fake devolve `{ data: null, error: null }` — que é o que `maybeSingle` dá. */
const vazio = { data: null, error: null }

describe('zero linhas vira 404', () => {
  const casos: [string, () => Promise<unknown>][] = [
    [
      'setDocumentPublished',
      () => setDocumentPublished(fakeSupabase({ portal_documents: vazio }).client, TENANT, ID, true),
    ],
    [
      'setDocumentAudience',
      () =>
        setDocumentAudience(fakeSupabase({ portal_documents: vazio }).client, TENANT, ID, [
          'inquilino',
        ]),
    ],
    [
      'setPortalUserActive',
      () => setPortalUserActive(fakeSupabase({ portal_users: vazio }).client, TENANT, ID, false),
    ],
    [
      'updateContract',
      () =>
        updateContract(fakeSupabase({ contracts: vazio }).client, TENANT, ID, {
          code: 'LOC-001',
          addressLabel: 'Rua X, 1',
          status: 'ativo',
          propertyId: null,
          startedOn: null,
          endsOn: null,
          rentAmount: null,
          dueDay: null,
          adjustmentIndex: null,
        }),
    ],
  ]

  for (const [nome, chamar] of casos) {
    test(`${nome} responde 404`, async () => {
      await expect(chamar()).rejects.toMatchObject({ statusCode: 404 })
    })
  }

  test('nenhum deles responde 5xx', async () => {
    // O que o `.single()` fazia. Afirmado à parte porque `toMatchObject` acima
    // passaria se alguém trocasse o 404 por outra coisa errada do mesmo jeito.
    for (const [nome, chamar] of casos) {
      const erro = await chamar().catch((e) => e as { statusCode?: number })
      expect(erro?.statusCode, nome).toBeLessThan(500)
    }
  })
})
