import { describe, expect, test } from 'vitest'
import { FOOTER_LINKS_MAX, isSafeFooterHref, sanitizeFooterLinks } from '~~/shared/utils/footer-links'

describe('isSafeFooterHref', () => {
  test('aceita caminho interno', () => {
    expect(isSafeFooterHref('/quero-vender')).toBe(true)
    expect(isSafeFooterHref('/imoveis/casas-a-venda')).toBe(true)
  })

  test('aceita http, https, mailto e tel', () => {
    expect(isSafeFooterHref('https://instagram.com/imobiliaria')).toBe(true)
    expect(isSafeFooterHref('http://exemplo.com.br')).toBe(true)
    expect(isSafeFooterHref('mailto:contato@imob.com.br')).toBe(true)
    expect(isSafeFooterHref('tel:+5567991234567')).toBe(true)
  })

  test('recusa javascript: — é XSS servido no domínio do cliente', () => {
    // Este href vai para o rodapé de TODAS as páginas públicas. Um esquema
    // executável aqui roda no domínio da imobiliária, com a sessão de quem
    // estiver visitando.
    expect(isSafeFooterHref('javascript:alert(1)')).toBe(false)
    expect(isSafeFooterHref('JavaScript:alert(1)')).toBe(false)
    expect(isSafeFooterHref('  javascript:alert(1)')).toBe(false)
  })

  test('recusa esquema disfarçado com caractere de controle', () => {
    // Navegador ignora esses caracteres ao resolver o esquema; uma checagem
    // ingênua por prefixo não ignoraria, e o link passaria.
    expect(isSafeFooterHref('java\nscript:alert(1)')).toBe(false)
    expect(isSafeFooterHref('java\tscript:alert(1)')).toBe(false)
  })

  test('recusa data: e vbscript:', () => {
    expect(isSafeFooterHref('data:text/html,<script>alert(1)</script>')).toBe(false)
    expect(isSafeFooterHref('vbscript:msgbox(1)')).toBe(false)
  })

  test('recusa URL relativa a protocolo, que parece interna e não é', () => {
    // `//evil.com` herda o protocolo e sai do site sem parecer que sai.
    expect(isSafeFooterHref('//evil.com')).toBe(false)
  })

  test('recusa caminho sem barra inicial', () => {
    // Resolveria relativo à página atual, então o mesmo link do rodapé levaria
    // a lugares diferentes conforme onde a pessoa está.
    expect(isSafeFooterHref('quero-vender')).toBe(false)
  })

  test('recusa vazio', () => {
    expect(isSafeFooterHref('')).toBe(false)
    expect(isSafeFooterHref('   ')).toBe(false)
  })
})

describe('sanitizeFooterLinks', () => {
  test('mantém os links válidos, já aparados', () => {
    expect(sanitizeFooterLinks([{ label: '  Política de privacidade ', href: ' /privacidade ' }])).toEqual([
      { label: 'Política de privacidade', href: '/privacidade' },
    ])
  })

  test('descarta link com endereço perigoso em vez de gravar', () => {
    expect(
      sanitizeFooterLinks([
        { label: 'Bom', href: '/sobre' },
        { label: 'Ruim', href: 'javascript:alert(1)' },
      ]),
    ).toEqual([{ label: 'Bom', href: '/sobre' }])
  })

  test('descarta link sem rótulo — apareceria como um vazio clicável', () => {
    expect(sanitizeFooterLinks([{ label: '   ', href: '/sobre' }])).toEqual([])
  })

  test('respeita o teto: rodapé é sitewide e não pode virar lista telefônica', () => {
    const muitos = Array.from({ length: 20 }, (_, i) => ({ label: `L${i}`, href: `/p${i}` }))
    expect(sanitizeFooterLinks(muitos)).toHaveLength(FOOTER_LINKS_MAX)
  })

  test('corta rótulo comprido que quebraria o layout', () => {
    const r = sanitizeFooterLinks([{ label: 'x'.repeat(200), href: '/a' }])
    expect(r[0]!.label.length).toBeLessThanOrEqual(40)
  })

  test('tolera lixo vindo do banco ou do body', () => {
    expect(sanitizeFooterLinks(null)).toEqual([])
    expect(sanitizeFooterLinks('nada disso')).toEqual([])
    expect(sanitizeFooterLinks([1, 'a', null, { href: '/x' }])).toEqual([])
  })
})
