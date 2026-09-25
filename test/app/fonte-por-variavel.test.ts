import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, test } from 'vitest'
import { stripComments } from '../helpers/strip-comments'

/**
 * Nenhum estilo do site ou do painel escreve o nome de uma fonte: usa
 * `var(--font-display)` ou `var(--font-body)`.
 *
 * É o que deixa um tema trocar a tipografia (ver
 * docs/superpowers/specs/2026-09-25-temas-da-vitrine-design.md). Havia 40
 * declarações com "Space Grotesk" e "Inter" escritas à mão em 16 arquivos; um
 * componente novo que volte a fazer isso fica igual em TODOS os temas — e nada
 * reclama, porque no tema padrão ele parece certo.
 *
 * Também protege a fonte substituta: `--font-display` e `--font-body` carregam
 * o nome "… Fallback: sans-serif" que o @nuxt/fonts gera com métricas ajustadas
 * contra o salto de layout (ver o comentário em main.css). Uma declaração
 * escrita à mão até recebe essa substituta do módulo, mas passa a divergir do
 * tema — e é a divergência que este teste existe para tornar visível.
 *
 * ⚠️ Fora de propósito: a landing da Moradi (`Moradi*.vue`). Ela é a marca da
 * plataforma, não um site de cliente, e tem tipografia própria que nenhum tema
 * deve alcançar.
 */

const APP = join(process.cwd(), 'app')

function arquivos(dir: string): string[] {
  const out: string[] = []
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) out.push(...arquivos(caminho))
    else if (/\.(vue|css)$/.test(nome) && !nome.startsWith('Moradi')) out.push(caminho)
  }
  return out
}

/** Só o CSS: em `.vue`, o conteúdo dos blocos `<style>`. */
function css(caminho: string): string {
  const fonte = readFileSync(caminho, 'utf8')
  const estilo = caminho.endsWith('.css')
    ? fonte
    : [...fonte.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n')
  return stripComments(estilo)
}

const PERMITIDO = /^(var\(--font-(display|body)\)|inherit)$/

describe('fonte sempre por variável', () => {
  test('font-family só usa var(--font-display), var(--font-body) ou inherit', () => {
    const violacoes: string[] = []
    for (const caminho of arquivos(APP)) {
      for (const m of css(caminho).matchAll(/(?<![-\w])font-family:\s*([^;{}]+);/g)) {
        const valor = m[1]!.trim()
        if (!PERMITIDO.test(valor)) violacoes.push(`${relative(process.cwd(), caminho)}: font-family: ${valor}`)
      }
    }
    expect(violacoes, 'Troque o nome da fonte por var(--font-display) ou var(--font-body).').toEqual([])
  })

  test('o atalho `font:` não esconde um nome de fonte', () => {
    const violacoes: string[] = []
    for (const caminho of arquivos(APP)) {
      for (const m of css(caminho).matchAll(/(?<![-\w])font:\s*([^;{}]+);/g)) {
        if (/["']/.test(m[1]!)) violacoes.push(`${relative(process.cwd(), caminho)}: font: ${m[1]!.trim()}`)
      }
    }
    expect(violacoes).toEqual([])
  })

  test('as variáveis carregam a fonte substituta do @nuxt/fonts', () => {
    const main = css(join(APP, 'assets', 'css', 'main.css'))
    expect(main).toMatch(/--font-display:\s*"Space Grotesk",\s*"Space Grotesk Fallback: sans-serif"/)
    expect(main).toMatch(/--font-body:\s*"Inter",\s*"Inter Fallback: sans-serif"/)
  })
})
