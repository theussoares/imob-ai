import { describe, expect, test } from 'vitest'
import { montarPrompt, sanitizarEntradaDescricao } from '~~/server/utils/descricao-prompt'

const STORAGE = 'https://eixz.supabase.co'

function bodyValido(over: Record<string, unknown> = {}) {
  return {
    title: 'Casa no Jardim Alvorada',
    type: 'casa',
    purpose: 'venda',
    neighborhood: 'Jardim Alvorada',
    city: 'Três Lagoas',
    bedrooms: 3,
    suites: 1,
    bathrooms: 2,
    parking: 2,
    area: 180,
    highStandard: false,
    features: ['Piscina', 'Churrasqueira'],
    ...over,
  }
}

describe('sanitizarEntradaDescricao — privacidade', () => {
  /**
   * O TESTE CENTRAL desta feature.
   *
   * Os campos do prompt vêm do BODY, não do banco. Um `...body` no meio do
   * caminho faz `owner_phone` enviado à mão atravessar a validação e chegar ao
   * prompt — e o vazamento sai dentro de um texto cujo destino é a publicação.
   * Por isso o saneador monta objeto NOVO com as chaves conhecidas.
   */
  test('descarta campo interno enviado à mão no body', () => {
    const e = sanitizarEntradaDescricao(
      bodyValido({
        owner_name: 'Dono Silva',
        ownerName: 'Dono Silva',
        owner_phone: '5567999990000',
        ownerPhone: '5567999990000',
        location: 'Rua Interna, 123',
        broker: { name: 'Corretor X', phone: '5567988887777' },
        brokerPhone: '5567988887777',
        updated_by: 'user-1',
      }),
      STORAGE,
    )
    const serializado = JSON.stringify(e)
    for (const proibido of ['Dono Silva', '5567999990000', 'Rua Interna', 'Corretor X', 'user-1']) {
      expect(serializado).not.toContain(proibido)
    }
  })

  test('o prompt montado também não contém nada interno', () => {
    const e = sanitizarEntradaDescricao(bodyValido({ ownerName: 'Dono Silva', location: 'Rua X, 1' }), STORAGE)
    const { system, prompt } = montarPrompt(e, 'sobrio')
    expect(`${system}\n${prompt}`).not.toContain('Dono Silva')
    expect(`${system}\n${prompt}`).not.toContain('Rua X')
  })
})

describe('sanitizarEntradaDescricao — limites', () => {
  test('título acima de 200 caracteres é recusado', () => {
    expect(() => sanitizarEntradaDescricao(bodyValido({ title: 'a'.repeat(201) }), STORAGE))
      .toThrow(expect.objectContaining({ statusCode: 422 }))
  })

  test('dicas acima de 500 caracteres são recusadas', () => {
    expect(() => sanitizarEntradaDescricao(bodyValido({ dicas: 'a'.repeat(501) }), STORAGE))
      .toThrow(expect.objectContaining({ statusCode: 422 }))
  })

  test('mais de 30 diferenciais é recusado', () => {
    const features = Array.from({ length: 31 }, (_, i) => `F${i}`)
    expect(() => sanitizarEntradaDescricao(bodyValido({ features }), STORAGE))
      .toThrow(expect.objectContaining({ statusCode: 422 }))
  })

  test('tipo fora da lista é recusado', () => {
    expect(() => sanitizarEntradaDescricao(bodyValido({ type: 'castelo' }), STORAGE))
      .toThrow(expect.objectContaining({ statusCode: 422 }))
  })
})

describe('sanitizarEntradaDescricao — foto', () => {
  test('aceita URL da origem do Storage', () => {
    const e = sanitizarEntradaDescricao(bodyValido({ imagemUrl: `${STORAGE}/storage/v1/object/public/x/a.webp` }), STORAGE)
    expect(e.imagemUrl).toBe(`${STORAGE}/storage/v1/object/public/x/a.webp`)
  })

  // Sem esta guarda, o body escolhe qualquer endereço da internet e a busca
  // acontece na infraestrutura do provedor, no crédito da plataforma.
  test('recusa URL de fora da plataforma', () => {
    for (const url of ['https://evil.example/a.png', 'http://169.254.169.254/latest/meta-data']) {
      expect(() => sanitizarEntradaDescricao(bodyValido({ imagemUrl: url }), STORAGE))
        .toThrow(expect.objectContaining({ statusCode: 422 }))
    }
  })

  test('recusa host que só começa com a origem', () => {
    expect(() => sanitizarEntradaDescricao(bodyValido({ imagemUrl: `${STORAGE}.evil.example/a.png` }), STORAGE))
      .toThrow(expect.objectContaining({ statusCode: 422 }))
  })
})

describe('montarPrompt', () => {
  test('sem descrição atual, não entra bloco de reescrita', () => {
    const { prompt } = montarPrompt(sanitizarEntradaDescricao(bodyValido(), STORAGE), 'sobrio')
    expect(prompt).not.toContain('DESCRIÇÃO ATUAL')
  })

  test('com descrição atual, entra o bloco de reescrita', () => {
    const e = sanitizarEntradaDescricao(bodyValido({ descricaoAtual: 'Casa boa.' }), STORAGE)
    expect(montarPrompt(e, 'sobrio').prompt).toContain('DESCRIÇÃO ATUAL')
  })

  test('o tom escolhido chega ao system prompt', () => {
    const e = sanitizarEntradaDescricao(bodyValido(), STORAGE)
    expect(montarPrompt(e, 'alto_padrao').system).toContain('sofisticado')
  })

  // O prompt é a única trava contra alegação enganosa (CDC art. 37) além da
  // revisão humana. Se as proibições sumirem num refactor, o teste cai.
  test('o system prompt proíbe inventar atributo e proíbe markdown', () => {
    const { system } = montarPrompt(sanitizarEntradaDescricao(bodyValido(), STORAGE), 'sobrio')
    for (const termo of ['vista', 'porcelanato', 'markdown', 'preço']) {
      expect(system.toLowerCase()).toContain(termo)
    }
  })
})
