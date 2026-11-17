import { describe, expect, test, vi } from 'vitest'
import type { Estado } from '~~/layers/gestao/domain/acoes'
import { amarrar, executarAcao, MSG_CONFLITO_VERSAO } from '~~/server/utils/gestao-acoes'

/**
 * O despachante é o único lugar com a regra «carregar → rodar → gravar com
 * versão». Estes testes fixam os três códigos que o cliente distingue (404, 422,
 * 409) e que o ator/data saem do servidor, não da ação.
 */
interface Agregado {
  id: string
  versao: number
  marca: string
}

const base: Agregado = { id: 'X-1', versao: 3, marca: 'antes' }
const vazio: Estado = { processos: [], documentos: [], locacoes: [] }

function montar(over: { carregar?: () => Promise<Agregado | null>; gravar?: (n: Agregado, v: number) => Promise<'ok' | 'conflito'>; acao?: Parameters<typeof executarAcao>[0]['acao'] }) {
  return {
    carregar: over.carregar ?? (async () => base),
    paraEstado: () => vazio,
    doEstado: (_e: Estado, antes: Agregado) => ({ ...antes, marca: 'depois' }),
    gravar: over.gravar ?? (async () => 'ok' as const),
    acao: over.acao ?? ((estado) => ({ ok: true, estado })),
  }
}

describe('executarAcao', () => {
  test('404 quando o agregado não existe (ou não é visível ao membro)', async () => {
    const gravar = vi.fn()
    await expect(executarAcao(montar({ carregar: async () => null, gravar }))).rejects.toMatchObject({ statusCode: 404 })
    expect(gravar).not.toHaveBeenCalled()
  })

  test('422 com a frase do domínio quando a regra recusa, sem gravar', async () => {
    const gravar = vi.fn()
    const p = executarAcao(montar({ acao: () => ({ ok: false, erro: 'Conclua as etapas em ordem.' }), gravar }))
    await expect(p).rejects.toMatchObject({ statusCode: 422, statusMessage: 'Conclua as etapas em ordem.', data: { erro: 'Conclua as etapas em ordem.' } })
    expect(gravar).not.toHaveBeenCalled()
  })

  test('409 com a mensagem combinada quando a versão mudou, e nada é devolvido como gravado', async () => {
    const p = executarAcao(montar({ gravar: async () => 'conflito' }))
    await expect(p).rejects.toMatchObject({ statusCode: 409, statusMessage: 'Este processo foi alterado por outra pessoa. Recarregue.' })
    expect(MSG_CONFLITO_VERSAO).toBe('Este processo foi alterado por outra pessoa. Recarregue.')
  })

  test('sucesso: grava a versão seguinte condicionada à versão lida', async () => {
    const gravar = vi.fn(async () => 'ok' as const)
    const novo = await executarAcao(montar({ gravar }))
    expect(gravar).toHaveBeenCalledWith({ ...base, marca: 'depois', versao: 4 }, 3)
    expect(novo.versao).toBe(4)
    expect(novo.marca).toBe('depois')
  })

  test('ator e data são os amarrados pelo servidor, não o que o executor passa', async () => {
    const fn = vi.fn((estado: Estado) => ({ ok: true as const, estado }))
    await executarAcao(montar({ acao: amarrar(fn, { nome: 'Ana' }, '17/11/2026 10:00') }))
    expect(fn).toHaveBeenCalledWith(vazio, { nome: 'Ana' }, '17/11/2026 10:00')
  })
})
