import { describe, expect, test } from 'vitest'
import { montarPrompt, sanitizarEntradaDescricao } from '~~/server/utils/descricao-prompt'

const STORAGE = 'https://eixz.supabase.co'

/**
 * Allowlist ESTRUTURAL, mesmo padrão de
 * `test/server/public-payload-guardrail.test.ts:102-105` (lá é por chave
 * interna proibida; aqui é o espelho — só estas chaves podem existir).
 *
 * O teste de VALOR logo abaixo (substring plantada no body) só pega dado que
 * ele mesmo pensou em proibir. Uma chave nova (`brokerPhone`, `ownerEmail`,
 * uma comissão) que carregue um valor que ninguém lembrou de listar passa
 * verde nele. Esta allowlist pega por CONSTRUÇÃO: chave que `sanitizarEntradaDescricao`
 * não conhecia antes quebra `Object.keys(e).sort()` aqui, e entrar na lista é
 * um ato consciente que aparece no diff da revisão.
 */
const CHAVES_PERMITIDAS = [
  'area',
  'bathrooms',
  'bedrooms',
  'city',
  'descricaoAtual',
  'dicas',
  'features',
  'highStandard',
  'imagemUrl',
  'neighborhood',
  'parking',
  'purpose',
  'state',
  'suites',
  'title',
  'type',
].sort()

function bodyValido(over: Record<string, unknown> = {}) {
  return {
    title: 'Casa no Jardim Alvorada',
    type: 'casa',
    purpose: 'venda',
    neighborhood: 'Jardim Alvorada',
    city: 'Três Lagoas',
    state: 'MS',
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
  // Achado 1 do fix round 1: guardrail por chave, não só por valor plantado.
  test('devolve exatamente as chaves da allowlist, nem uma a mais', () => {
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
    expect(Object.keys(e).sort()).toEqual(CHAVES_PERMITIDAS)
  })

  /**
   * O TESTE CENTRAL desta feature.
   *
   * Os campos do prompt vêm do BODY, não do banco. Um `...body` no meio do
   * caminho faz `owner_phone` enviado à mão atravessar a validação e chegar ao
   * prompt — e o vazamento sai dentro de um texto cujo destino é a publicação.
   * Por isso o saneador monta objeto NOVO com as chaves conhecidas.
   *
   * Este teste é por VALOR e complementa o de chave acima: pega o caso em que
   * um valor proibido vaza por uma chave PERMITIDA (ex.: alguém grava
   * `ownerName` dentro de `dicas` por engano), que o teste estrutural não vê.
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
    // `brokerPhone` entra na lista de proibidos aqui: é a única exceção
    // pública deliberada do CLAUDE.md (telefone do captador), o que a torna o
    // valor mais plausível de alguém "esquecer de proibir" num refactor.
    for (const proibido of ['Dono Silva', '5567999990000', 'Rua Interna', 'Corretor X', 'user-1', '5567988887777']) {
      expect(serializado).not.toContain(proibido)
    }
  })

  test('o prompt montado também não contém nada interno', () => {
    const e = sanitizarEntradaDescricao(
      bodyValido({ ownerName: 'Dono Silva', location: 'Rua X, 1', brokerPhone: '5567988887777' }),
      STORAGE,
    )
    const { system, prompt } = montarPrompt(e, 'sobrio')
    const texto = `${system}\n${prompt}`
    expect(texto).not.toContain('Dono Silva')
    expect(texto).not.toContain('Rua X')
    expect(texto).not.toContain('5567988887777')
  })
})

// Achado 3 do fix round 1: até aqui só `imagemUrl` tinha asserção positiva —
// trocar `city` por `neighborhood` no retorno, ou apagar campo inteiro,
// passava verde. Estes testes fixam o objeto saneado por completo.
describe('sanitizarEntradaDescricao — campos permitidos (positivo)', () => {
  test('objeto saneado é exatamente o esperado, campo a campo', () => {
    const e = sanitizarEntradaDescricao(bodyValido(), STORAGE)
    expect(e).toEqual({
      title: 'Casa no Jardim Alvorada',
      type: 'casa',
      purpose: 'venda',
      neighborhood: 'Jardim Alvorada',
      city: 'Três Lagoas',
      state: 'MS',
      bedrooms: 3,
      suites: 1,
      bathrooms: 2,
      parking: 2,
      area: 180,
      highStandard: false,
      features: ['Piscina', 'Churrasqueira'],
      dicas: null,
      descricaoAtual: null,
      imagemUrl: null,
    })
  })
})

describe('sanitizarEntradaDescricao — limites', () => {
  test('título acima de 200 caracteres é recusado', () => {
    expect(() => sanitizarEntradaDescricao(bodyValido({ title: 'a'.repeat(201) }), STORAGE))
      .toThrow(expect.objectContaining({ statusCode: 422 }))
  })

  // Achado 5 do fix round 1: era o único dos cinco tetos sem cobertura, e o
  // maior — a bomba de tokens mais barata de reintroduzir num "simplifica" do
  // campo de reescrita.
  test('descrição atual acima de 2000 caracteres é recusada', () => {
    expect(() => sanitizarEntradaDescricao(bodyValido({ descricaoAtual: 'a'.repeat(2001) }), STORAGE))
      .toThrow(expect.objectContaining({ statusCode: 422 }))
  })

  test('dicas acima de 500 caracteres são recusadas', () => {
    expect(() => sanitizarEntradaDescricao(bodyValido({ dicas: 'a'.repeat(501) }), STORAGE))
      .toThrow(expect.objectContaining({ statusCode: 422 }))
  })

  // Achado 5 do fix round 1.
  test('um diferencial acima de 60 caracteres é recusado', () => {
    expect(() => sanitizarEntradaDescricao(bodyValido({ features: ['a'.repeat(61)] }), STORAGE))
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

  // Achado 2 do fix round 1: `supabaseUrl` malformado é defeito de
  // CONFIGURAÇÃO, não de entrada — precisa virar 500, não o mesmo 422 que uma
  // URL de foto ruim, senão o sintoma aponta pra causa errada (a foto) pra
  // sempre.
  test('supabaseUrl de configuração malformado vira 500, não 422', () => {
    expect(() => sanitizarEntradaDescricao(bodyValido({ imagemUrl: `${STORAGE}/a.png` }), 'não-é-uma-url'))
      .toThrow(expect.objectContaining({ statusCode: 500 }))
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

  // Achado 3 do fix round 1: linhas concretas do bloco CAMPOS, incluindo
  // `Estado` (achado do ruling — bairro/cidade sozinhos não desambiguam
  // cidade homônima entre UFs). Apagar a montagem do bloco, ou trocar um
  // campo pelo vizinho errado, derruba este teste.
  test('o bloco CAMPOS contém as linhas concretas dos dados enviados', () => {
    const e = sanitizarEntradaDescricao(bodyValido(), STORAGE)
    const { prompt } = montarPrompt(e, 'sobrio')
    expect(prompt).toContain('Quartos: 3')
    expect(prompt).toContain('Estado: MS')
    expect(prompt).toContain('Diferenciais: Piscina, Churrasqueira')
  })

  // O prompt é a única trava contra alegação enganosa (CDC art. 37) além da
  // revisão humana. Se as proibições sumirem num refactor, o teste cai.
  //
  // Achado 4 do fix round 1: a lista original cobria 4 das 8 proibições da
  // spec. `andar`/`proximidade`/`financiamento` fecham as três que faltavam
  // (a quarta, "número fora dos campos", não tem substring própria pra testar
  // e fica coberta pela leitura humana da regra).
  test('o system prompt proíbe inventar atributo e proíbe markdown', () => {
    const { system } = montarPrompt(sanitizarEntradaDescricao(bodyValido(), STORAGE), 'sobrio')
    const s = system.toLowerCase()
    for (const termo of ['vista', 'porcelanato', 'andar', 'proximidade', 'financiamento', 'preço']) {
      expect(s).toContain(termo)
    }
    // Âncora só existe na REGRA, não na justificativa ("...num catálogo em
    // markdown"): checar só a palavra "markdown" passava verde com a regra
    // apagada e a justificativa sozinha no texto.
    expect(s).toContain('iniciando linha')
  })
})
