import { describe, expect, test } from 'vitest'
import { hubCidadeSlug, hubCorresponde, hubDescricao, hubMarca, hubPath, hubTitulo } from '~~/shared/utils/hub-local'

/**
 * O hub local é uma URL derivada de texto digitado à mão. As ameaças:
 *   - cidade escrita de jeitos diferentes gerando URLs diferentes (e a do
 *     sitemap divergindo da que a rota aceita);
 *   - `/imobiliaria-qualquer-coisa` respondendo 200: conteúdo duplicado infinito;
 *   - tenant sem cidade publicando "Imobiliária em ";
 *   - a descrição prometendo o que a imobiliária não tem.
 */

describe('slug e caminho', () => {
  test('as grafias do mesmo nome dão o mesmo caminho', () => {
    for (const c of ['Três Lagoas', 'Tres Lagoas ', 'TRÊS LAGOAS', 'três  lagoas']) {
      expect(hubPath(c)).toBe('/imobiliaria-tres-lagoas')
    }
  })

  test('sem cidade utilizável não há hub', () => {
    for (const c of [null, undefined, '', '   ', '---']) {
      expect(hubCidadeSlug(c)).toBeNull()
      expect(hubPath(c)).toBeNull()
    }
  })
})

describe('hubCorresponde', () => {
  test('só o slug da cidade do próprio tenant', () => {
    expect(hubCorresponde('Três Lagoas', 'tres-lagoas')).toBe(true)
    expect(hubCorresponde('Três Lagoas', 'campo-grande')).toBe(false)
    expect(hubCorresponde('Três Lagoas', 'Tres-Lagoas')).toBe(false)
    expect(hubCorresponde('Três Lagoas', '')).toBe(false)
  })

  test('tenant sem cidade nunca corresponde, nem a parâmetro vazio', () => {
    expect(hubCorresponde(null, '')).toBe(false)
    expect(hubCorresponde('', 'qualquer')).toBe(false)
  })
})

describe('textos', () => {
  test('título com UF, e sem UF não deixa hífen solto', () => {
    expect(hubTitulo('Três Lagoas', 'MS')).toBe('Imobiliária em Três Lagoas - MS')
    expect(hubTitulo('Três Lagoas', null)).toBe('Imobiliária em Três Lagoas')
    expect(hubTitulo(' Três Lagoas ', ' MS ')).toBe('Imobiliária em Três Lagoas - MS')
  })

  test('a descrição usa a contagem real e não promete tipo de imóvel', () => {
    const d = hubDescricao({ name: 'OLMI Imóveis', city: 'Três Lagoas', state: 'MS', imoveis: 12 })
    expect(d).toContain('12 imóveis disponíveis')
    expect(d).toContain('Três Lagoas - MS')
    expect(d).not.toMatch(/casas|apartamentos|terrenos/i)
    expect(hubDescricao({ name: 'X', city: 'A', imoveis: 1 })).toContain('1 imóvel disponível')
    expect(hubDescricao({ name: 'X', city: 'A', imoveis: 0 })).not.toMatch(/\b0 im/)
  })
})

describe('hubMarca', () => {
  test('tira o complemento de SEO que o nome já traz, para o lugar não sair duas vezes', () => {
    expect(hubMarca('OLMI Imóveis | Imobiliária em Três Lagoas')).toBe('OLMI Imóveis')
    const d = hubDescricao({ name: 'OLMI Imóveis | Imobiliária em Três Lagoas', city: 'Três Lagoas', state: 'MS', imoveis: 3 })
    expect(d.match(/Três Lagoas/g)).toHaveLength(1)
  })

  test('nome sem barra fica como está (e "|" colado numa palavra não corta)', () => {
    expect(hubMarca('Aurora Imóveis')).toBe('Aurora Imóveis')
    expect(hubMarca('A|B Imóveis')).toBe('A|B Imóveis')
  })
})
