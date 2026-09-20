import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

/**
 * O nome da imobiliária entra no `<title>` UMA vez, e quem o põe é o
 * `titleTemplate` do `app.vue`.
 *
 * O defeito que originou este arquivo apareceu em três páginas ao mesmo tempo —
 * `/privacidade`, `/quem-somos` e o login da Área do Cliente — e ninguém tinha
 * notado, porque cada uma parecia correta isolada: a página monta
 * "Entrar · Área do Cliente · Aurora Imóveis" e o template acrescenta
 * "· Aurora Imóveis" de novo. O resultado é a aba que o cliente vê ao chegar
 * pelo link do convite.
 *
 * A checagem é por leitura de fonte porque não há ambiente Nuxt nos testes (ver
 * `vitest.config.ts`). O que dá para afirmar estaticamente é a regra que
 * importa: nenhum `title:` interpola o nome do tenant.
 *
 * ⚠️ `ogTitle` e o `name` do JSON-LD são o caso OPOSTO e ficam de fora de
 * propósito: eles NÃO passam pelo template, então precisam do nome escrito à
 * mão. Tirá-lo de lá faria o card do WhatsApp perder o nome da imobiliária —
 * uma regressão silenciosa, que só aparece quando alguém compartilha o link.
 */

const PAGINAS = join(process.cwd(), 'app', 'pages')

function paginasVue(dir: string): string[] {
  const { readdirSync, statSync } = require('node:fs') as typeof import('node:fs')
  const out: string[] = []
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) out.push(...paginasVue(caminho))
    else if (nome.endsWith('.vue')) out.push(caminho)
  }
  return out
}

describe('nenhum title soma o nome do tenant', () => {
  const arquivos = paginasVue(PAGINAS)

  test('existem páginas para checar', () => {
    // Guarda contra o varredor quebrar e o arquivo inteiro virar teste vazio
    // que passa sempre.
    expect(arquivos.length).toBeGreaterThan(10)
  })

  for (const caminho of paginasVue(PAGINAS)) {
    const rel = caminho.slice(PAGINAS.length + 1).replace(/\\/g, '/')

    test(`${rel}`, () => {
      const fonte = readFileSync(caminho, 'utf8')

      // Pega `title: \`...${tenant.value?.name}...\`` e `title: '...' + tenant...`
      // na mesma expressão — que é a forma que o defeito teve nas três páginas.
      const linhas = fonte.split('\n')
      for (const [i, linha] of linhas.entries()) {
        if (!/(^|\s)title:/.test(linha)) continue
        expect(
          /tenant[^\n]*\.name/.test(linha),
          `${rel}:${i + 1} soma o nome do tenant no title — o titleTemplate do app.vue já faz isso`,
        ).toBe(false)
      }
    })
  }
})

describe('quem-somos separa o título da aba do título do card', () => {
  const fonte = readFileSync(join(PAGINAS, 'quem-somos.vue'), 'utf8')

  test('o title usa o título curto', () => {
    expect(fonte).toMatch(/title:\s*titulo\b/)
  })

  test('o ogTitle usa o título com o nome da imobiliária', () => {
    // Sem isto, o preview do link no WhatsApp vira só "Quem somos", sem dizer
    // de quem.
    expect(fonte).toMatch(/ogTitle:\s*\(\)\s*=>\s*tituloCompleto\.value/)
  })

  test('o título curto não menciona o tenant', () => {
    const linha = fonte.split('\n').find((l) => l.includes('const titulo ='))
    expect(linha, 'a constante `titulo` sumiu').toBeTruthy()
    expect(linha).not.toContain('tenant')
  })
})
