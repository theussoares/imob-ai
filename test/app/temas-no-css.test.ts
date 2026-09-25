import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { stripComments } from '../helpers/strip-comments'
import {
  DEFAULT_HEADER_STYLE,
  DEFAULT_SITE_THEME,
  HEADER_STYLES,
  SITE_THEMES,
} from '~~/shared/models/site-theme'

/**
 * A lista de temas (shared/models/site-theme.ts) e os blocos de CSS
 * (main.css) andam juntos.
 *
 * ⚠️ Cada lado sozinho falha em silêncio:
 * - tema na lista sem bloco no CSS: o painel oferece, o cliente escolhe, e o
 *   site continua igual ao clássico — parece que o tema "não pegou";
 * - bloco no CSS sem tema na lista: código morto que ninguém consegue ativar,
 *   e que a próxima pessoa edita achando que está em uso.
 *
 * O padrão (clássico, cabeçalho claro) é o :root — não tem bloco próprio, e
 * ganhar um seria duplicar o site de hoje num segundo lugar.
 */

const CSS = stripComments(readFileSync(join(process.cwd(), 'app/assets/css/main.css'), 'utf8'))

function valoresNoCss(atributo: string): Set<string> {
  return new Set([...CSS.matchAll(new RegExp(`\\[${atributo}="([a-z_]+)"\\]`, 'g'))].map((m) => m[1]!))
}

describe('temas e cabeçalhos no CSS', () => {
  test('todo tema da lista, menos o padrão, tem bloco em main.css — e só eles', () => {
    const esperados = SITE_THEMES.filter((t) => t !== DEFAULT_SITE_THEME)
    expect([...valoresNoCss('data-tema')].sort()).toEqual([...esperados].sort())
  })

  test('todo cabeçalho da lista, menos o padrão, tem bloco em main.css — e só eles', () => {
    const esperados = HEADER_STYLES.filter((h) => h !== DEFAULT_HEADER_STYLE)
    expect([...valoresNoCss('data-cabecalho')].sort()).toEqual([...esperados].sort())
  })

  // Um tema que troca a fonte sem citar a substituta perde as métricas
  // ajustadas do @nuxt/fonts: o texto pula de tamanho quando a fonte chega.
  test('toda família de tema vem seguida da sua fonte substituta', () => {
    for (const m of CSS.matchAll(/--font-(?:display|body):\s*"([^"]+)",\s*([^;]+);/g)) {
      const [, familia, resto] = m
      expect(resto, `${familia} sem "${familia} Fallback: …"`).toMatch(new RegExp(`^"${familia} Fallback: (serif|sans-serif)"`))
    }
  })
})
