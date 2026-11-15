import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ETAPAS_VENDA } from '../domain/status'

const raiz = join(__dirname, '..', 'app')
const vues = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? vues(p) : p.endsWith('.vue') ? [p] : []
  })

describe('estilo do painel', () => {
  // O main.css do site público define `.grid` própria (3 colunas fixas a partir de
  // 1040px). A classe `grid` do Tailwind perde para ela e os formulários e o
  // painel do processo ficaram espremidos. `[display:grid]` não usa o nome.
  it('nenhum template usa a classe `grid` pura (colide com o CSS do site)', () => {
    const ruins = vues(raiz).filter((p) => /class="[^"]*(?<![-\w[:])grid(?![-\w\]])/.test(readFileSync(p, 'utf8')))
    expect(ruins).toEqual([])
  })

  it('nomes de etapa não abreviam «Documentos»', () => {
    expect(ETAPAS_VENDA.filter((e) => /\bDocs?\b/.test(e))).toEqual([])
  })
})
