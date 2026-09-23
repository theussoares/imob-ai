import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import {
  STATIC_FOOTER_PAGES,
  resolveFooterPages,
  sanitizeFooterPageOverrides,
} from '~~/shared/utils/footer-pages'

const registro = [
  { path: '/quero-vender', label: 'Quero vender ou alugar' },
  { path: '/imoveis/casas-a-venda', label: 'Casas à venda' },
]

describe('resolveFooterPages', () => {
  test('sem ajuste nenhum, mostra tudo com o rótulo padrão', () => {
    // Página que a gente adiciona ao registro deve aparecer sozinha: o registro
    // já é a decisão de que ela pode ser linkada.
    expect(resolveFooterPages(registro, {})).toEqual([
      { path: '/quero-vender', label: 'Quero vender ou alugar' },
      { path: '/imoveis/casas-a-venda', label: 'Casas à venda' },
    ])
  })

  test('respeita o rótulo trocado pelo cliente', () => {
    expect(resolveFooterPages(registro, { '/quero-vender': { label: 'Anuncie conosco' } })[0]).toEqual({
      path: '/quero-vender',
      label: 'Anuncie conosco',
    })
  })

  test('esconde o que o cliente desligou', () => {
    const r = resolveFooterPages(registro, { '/quero-vender': { visible: false } })
    expect(r.map((p) => p.path)).toEqual(['/imoveis/casas-a-venda'])
  })

  test('rótulo vazio volta ao padrão em vez de sumir o texto', () => {
    // Apagar o campo não pode deixar um link em branco no rodapé.
    const r = resolveFooterPages(registro, { '/quero-vender': { label: '   ' } })
    expect(r[0]!.label).toBe('Quero vender ou alugar')
  })

  test('ajuste de página que não existe mais é ignorado', () => {
    // Categoria que deixou de qualificar, ou página que removemos: o ajuste
    // guardado no banco não pode ressuscitar um link quebrado.
    const r = resolveFooterPages(registro, { '/pagina-que-morreu': { label: 'Antiga' } })
    expect(r.map((p) => p.path)).toEqual(['/quero-vender', '/imoveis/casas-a-venda'])
  })

  test('mantém a ordem do registro, não a dos ajustes', () => {
    const r = resolveFooterPages(registro, {
      '/imoveis/casas-a-venda': { label: 'B' },
      '/quero-vender': { label: 'A' },
    })
    expect(r.map((p) => p.label)).toEqual(['A', 'B'])
  })
})

describe('sanitizeFooterPageOverrides', () => {
  test('guarda só o que o cliente realmente mudou', () => {
    expect(sanitizeFooterPageOverrides({ '/quero-vender': { label: ' Anuncie ', visible: false } })).toEqual({
      '/quero-vender': { label: 'Anuncie', visible: false },
    })
  })

  test('descarta chave que não é caminho interno', () => {
    // A chave vira `to` de um link. Só o registro define caminhos válidos, mas
    // o banco aceita qualquer JSON — inclusive gravado por SQL direto.
    expect(sanitizeFooterPageOverrides({ 'https://evil.com': { visible: true } })).toEqual({})
    expect(sanitizeFooterPageOverrides({ 'javascript:alert(1)': { visible: true } })).toEqual({})
  })

  test('corta rótulo comprido', () => {
    const r = sanitizeFooterPageOverrides({ '/a': { label: 'x'.repeat(200) } })
    expect(r['/a']!.label!.length).toBeLessThanOrEqual(40)
  })

  test('tolera lixo', () => {
    expect(sanitizeFooterPageOverrides(null)).toEqual({})
    expect(sanitizeFooterPageOverrides([1, 2])).toEqual({})
    expect(sanitizeFooterPageOverrides({ '/a': 'nao é objeto' })).toEqual({})
  })
})

describe('rascunho de política de privacidade', () => {
  const CAMINHO = '/privacidade'
  const ARQUIVO = join(process.cwd(), 'app', 'pages', 'privacidade.vue')
  const registrada = STATIC_FOOTER_PAGES.some((p) => p.path === CAMINHO)
  const fonte = readFileSync(ARQUIVO, 'utf8')

  /**
   * A página existe e responde na URL em TODO domínio de tenant, mas o texto
   * jurídico ainda não passou por advogado — por isso ela não está no registro
   * acima. Só que não estar no rodapé não a esconde de crawler: basta um link
   * externo, um referrer ou o palpite de URL mais óbvio que existe para uma
   * política não revisada ser indexada e servida como a política de uma
   * imobiliária real, com um `canonical` afirmando ser a versão autoritativa.
   *
   * Enquanto for rascunho, `noindex` é o que segura isso. Quando a revisão sair
   * e a página entrar no registro, este teste inverte a exigência sozinho —
   * publicar no rodapé e continuar pedindo para não indexar é contradição.
   */
  test(registrada ? 'publicada: sem noindex' : 'rascunho: com noindex', () => {
    const temNoindex = /name:\s*'robots'[\s\S]{0,60}noindex/.test(fonte)
    expect(
      temNoindex,
      registrada
        ? 'a página está no rodapé e ainda pede noindex'
        : 'rascunho não registrado no rodapé precisa de noindex',
    ).toBe(!registrada)
  })

  test('as telas do portal também não são indexáveis', () => {
    // Login, definir senha e as páginas da área do cliente. Nenhuma delas tem o
    // que fazer num índice de busca.
    for (const rel of [
      'area-cliente/login.vue',
      'area-cliente/definir-senha.vue',
      'area-cliente/recuperar-senha.vue',
      'area-cliente/index.vue',
      'area-cliente/contratos/[id].vue',
    ]) {
      const f = readFileSync(join(process.cwd(), 'app', 'pages', rel), 'utf8')
      expect(/noindex/.test(f), `${rel} sem noindex`).toBe(true)
    }
  })
})

describe('página que depende de recurso', () => {
  /**
   * O Quem somos nasce no registro como qualquer outra página, mas só existe
   * para quem contratou. Sem esta marca ele voltaria ao rodapé de TODA
   * imobiliária — foi exatamente assim que três das quatro receberiam um link
   * para uma página em branco, porque só uma tinha conteúdo escrito.
   *
   * A marca fica no REGISTRO, não numa lista paralela de exceções: quem
   * adiciona uma página vê a coluna do lado e decide na hora.
   */
  const comRecurso = [
    { path: '/quero-vender', label: 'Quero vender ou alugar' },
    { path: '/quem-somos', label: 'Quem somos', requires: 'about' as const },
  ]

  test('recurso ligado: a página entra', () => {
    const r = resolveFooterPages(comRecurso, {}, { about: true })
    expect(r.map((p) => p.path)).toEqual(['/quero-vender', '/quem-somos'])
  })

  test('recurso desligado: a página some', () => {
    const r = resolveFooterPages(comRecurso, {}, { about: false })
    expect(r.map((p) => p.path)).toEqual(['/quero-vender'])
  })

  test('sem informação de recurso, some — falha fechado', () => {
    // Chamador que esquecer de passar os flags esconde a página em vez de
    // publicá-la. O erro barato é o link sumir; o caro é a página vazia no ar.
    const r = resolveFooterPages(comRecurso, {})
    expect(r.map((p) => p.path)).toEqual(['/quero-vender'])
  })

  test('página sem marca não é afetada pelos flags', () => {
    // A trava não pode virar hábito: "Quero vender" serve a qualquer
    // imobiliária e não depende de nada.
    const r = resolveFooterPages(comRecurso, {}, { about: false })
    expect(r.map((p) => p.path)).toContain('/quero-vender')
  })

  test('o cliente ainda consegue esconder uma página que tem o recurso', () => {
    // Ter o recurso é poder mostrar, não ser obrigado a mostrar.
    const r = resolveFooterPages(comRecurso, { '/quem-somos': { visible: false } }, { about: true })
    expect(r.map((p) => p.path)).toEqual(['/quero-vender'])
  })
})

describe('o registro marca o Quem somos', () => {
  test('a entrada real exige o recurso', () => {
    // O teste acima usa registro de mentira. Este olha o de verdade: sem a
    // marca aqui, toda a trava acima vira código morto.
    const entrada = STATIC_FOOTER_PAGES.find((p) => p.path === '/quem-somos')
    expect(entrada, '/quem-somos saiu do registro').toBeTruthy()
    expect(entrada!.requires).toBe('about')
  })
})
