import { describe, expect, test } from 'vitest'
import { auditarDocumento } from '~~/server/utils/gestao-documento-evento'
import { fakeSupabase } from '../helpers/fake-supabase'

/**
 * Costura F1 × F3, SEM mock: `registrarEvento` da F1 engole o erro do insert (a ação
 * já foi gravada, repetir não ajuda), mas o download da F3 promete o contrário —
 * sem registro de quem baixou RG/certidão, sem URL. Com o mock antigo (que lançava)
 * a promessa parecia cumprida; com o repository real ela era letra morta.
 */
const T = 'tenant-1'
const ctx = (resultado: { data: unknown; error: unknown }) => {
  const { client, calls } = fakeSupabase({ gestao_eventos: resultado })
  return { c: { db: client, membro: { tenantId: T, userId: 'u1', nome: 'Ana' } } as never, calls }
}
const falha = { data: null, error: { message: 'banco fora' } }

describe('auditarDocumento com o repository real', () => {
  test('obrigatório: insert que falha vira 500 e a URL não sai', async () => {
    const { c } = ctx(falha)
    await expect(auditarDocumento(c, 'Baixou o documento', 'd1', { obrigatorio: true })).rejects.toMatchObject({ statusCode: 500 })
  })

  test('não obrigatório: insert que falha não derruba a ação já gravada', async () => {
    const { c } = ctx(falha)
    await expect(auditarDocumento(c, 'Apagou o documento', 'd1')).resolves.toBeUndefined()
  })

  test('grava o evento com tenant, ator e alvo do servidor', async () => {
    const { c, calls } = ctx({ data: null, error: null })
    await auditarDocumento(c, 'Baixou o documento', 'd1', { obrigatorio: true })
    expect(calls.find((x) => x.method === 'insert')!.args[0]).toEqual({ tenant_id: T, ator_user_id: 'u1', ator_nome: 'Ana', acao: 'Baixou o documento', alvo_tipo: 'documento', alvo_id: 'd1' })
  })
})
