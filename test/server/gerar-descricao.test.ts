import { describe, expect, test, vi } from 'vitest'
import { gerarDescricao } from '~~/server/utils/gerar-descricao'
import type { GerarDescricaoDeps } from '~~/server/utils/gerar-descricao'
import type { EntradaDescricao } from '~~/server/utils/descricao-prompt'

/**
 * A ordem das guardas de `gerarDescricao` é a lógica mais arriscada do
 * endpoint (ver o comentário do arquivo): reserva antes do provedor,
 * `marcarFalha` só no catch da chamada ao provedor, e o client de IA
 * resolvido antes de reservar. Nenhum dos 833 testes anteriores da suíte
 * exercitava essa ordem — moviam `gerarTexto` para antes de `reservarGeracao`,
 * ou tiravam `marcarFalha` do catch, e tudo continuava verde.
 */

const ENTRADA: EntradaDescricao = {
  title: 'Casa no Centro',
  type: 'casa',
  purpose: 'venda',
  neighborhood: 'Centro',
  city: 'Três Lagoas',
  state: 'MS',
  bedrooms: 3,
  suites: 1,
  bathrooms: 2,
  parking: 2,
  area: 180,
  highStandard: false,
  features: [],
  dicas: null,
  descricaoAtual: null,
  imagemUrl: null,
}

const CTX = {
  tenantId: 't1',
  userId: 'u1',
  propertyId: 'p1',
  entrada: ENTRADA,
  tom: 'sobrio' as const,
  model: 'claude-haiku-4-5',
}

function depsBase(overrides: Partial<GerarDescricaoDeps> = {}): GerarDescricaoDeps {
  return {
    reservarGeracao: vi.fn().mockResolvedValue('gen-1'),
    concluirGeracao: vi.fn().mockResolvedValue(undefined),
    marcarFalha: vi.fn().mockResolvedValue(undefined),
    contarNoMes: vi.fn().mockResolvedValue(5),
    gerarTexto: vi.fn().mockResolvedValue({
      texto: 'Descrição gerada.',
      inputTokens: 100,
      outputTokens: 50,
      model: 'claude-haiku-4-5',
    }),
    anthropicClient: vi.fn().mockReturnValue({ messages: { create: vi.fn() } }),
    ...overrides,
  }
}

describe('gerarDescricao — ordem das guardas', () => {
  test('reserva estourada: 429, e o provedor NUNCA é chamado', async () => {
    // Sem esta ordem, "cota" vira decoração: o provedor já teria sido pago
    // antes de o 429 existir.
    const deps = depsBase({ reservarGeracao: vi.fn().mockResolvedValue(null) })
    await expect(gerarDescricao(deps, CTX)).rejects.toMatchObject({ statusCode: 429 })
    expect(deps.gerarTexto).not.toHaveBeenCalled()
  })

  test('provedor lança: marcarFalha recebe o id da reserva, e o erro original é relançado', async () => {
    // `marcarFalha` fora do catch (ou catch que engole o erro) quebra as duas
    // garantias ao mesmo tempo: a linha reservada fica "reservada" para
    // sempre, e o chamador (endpoint) perde o status/mensagem do provedor.
    const erroOriginal = Object.assign(new Error('provedor fora'), { statusCode: 502 })
    const deps = depsBase({ gerarTexto: vi.fn().mockRejectedValue(erroOriginal) })
    await expect(gerarDescricao(deps, CTX)).rejects.toBe(erroOriginal)
    expect(deps.marcarFalha).toHaveBeenCalledWith('gen-1', CTX.tenantId)
  })

  test('concluirGeracao falha: a resposta sai mesmo assim, e vai para logError', async () => {
    // Este catch existe para o corretor não perder o texto por causa de um
    // problema em REGISTRAR o consumo — mas o problema precisa gritar em
    // algum lugar, senão é gasto real sem contagem de token.
    const logSpy = vi.fn()
    const original = (globalThis as { logError?: unknown }).logError
    Object.assign(globalThis, { logError: logSpy })
    try {
      const deps = depsBase({ concluirGeracao: vi.fn().mockRejectedValue(new Error('db fora')) })
      const resultado = await gerarDescricao(deps, CTX)
      expect(resultado.texto).toBe('Descrição gerada.')
      expect(logSpy).toHaveBeenCalledWith('ia.registro_falhou', expect.objectContaining({ id: 'gen-1' }))
    } finally {
      Object.assign(globalThis, { logError: original })
    }
  })

  test('client do provedor lança: NENHUMA reserva é feita', async () => {
    // O achado do fix round 1: sem chave configurada, cada clique de cada
    // imobiliária queimava uma geração da cota antes de a falta da chave
    // aparecer. O client precisa ser resolvido ANTES de `reservarGeracao`.
    const erroConfig = Object.assign(new Error('IA não configurada.'), { statusCode: 500 })
    const deps = depsBase({
      anthropicClient: vi.fn(() => {
        throw erroConfig
      }),
    })
    await expect(gerarDescricao(deps, CTX)).rejects.toBe(erroConfig)
    expect(deps.reservarGeracao).not.toHaveBeenCalled()
  })

  test('caminho feliz: client -> reserva -> provedor -> conclui -> conta, nessa ordem', async () => {
    const ordem: string[] = []
    const deps = depsBase({
      anthropicClient: vi.fn(() => {
        ordem.push('client')
        return { messages: { create: vi.fn() } }
      }),
      reservarGeracao: vi.fn(async () => {
        ordem.push('reservar')
        return 'gen-1'
      }),
      gerarTexto: vi.fn(async () => {
        ordem.push('gerar')
        return { texto: 'x', inputTokens: 1, outputTokens: 1, model: 'm' }
      }),
      concluirGeracao: vi.fn(async () => {
        ordem.push('concluir')
      }),
      contarNoMes: vi.fn(async () => {
        ordem.push('contar')
        return 3
      }),
    })
    const resultado = await gerarDescricao(deps, CTX)
    expect(ordem).toEqual(['client', 'reservar', 'gerar', 'concluir', 'contar'])
    // COTA_MENSAL_DESCRICAO (100) - 3 usadas.
    expect(resultado.restanteNoMes).toBe(97)
  })
})
