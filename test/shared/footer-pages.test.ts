import { describe, expect, test } from 'vitest'
import { resolveFooterPages, sanitizeFooterPageOverrides } from '~~/shared/utils/footer-pages'

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
