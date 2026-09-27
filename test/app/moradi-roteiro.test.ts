import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { NO_INICIAL, PRECOS, montarRoteiro } from '~~/app/utils/moradi-roteiro'

// Duas ameaças. A primeira é o beco sem saída: um nó que responde e não
// oferece nada, ou um botão que aponta para um nó que foi renomeado — no chat,
// isso é o visitante clicando e nada acontecendo. A segunda é o preço do chat
// divergir do card de plano no primeiro reajuste.

const roteiro = montarRoteiro({
  wa: (m) => `https://wa.me/5500000000000?text=${encodeURIComponent(m)}`,
  demoUrl: 'https://demo.usemoradi.com.br',
  cotaIa: 30,
})
const landing = readFileSync('app/components/MoradiLanding.vue', 'utf8')

describe('roteiro do chat da landing', () => {
  test('o nó inicial existe', () => {
    expect(roteiro[NO_INICIAL]).toBeDefined()
  })

  test('todo botão de nó aponta para um nó que existe', () => {
    for (const [id, no] of Object.entries(roteiro)) {
      for (const a of no.acoes) {
        if (a.tipo === 'no') expect(roteiro[a.para], `${id} → ${a.para}`).toBeDefined()
      }
    }
  })

  test('todo nó tem saída que não é só "voltar"', () => {
    for (const [id, no] of Object.entries(roteiro)) {
      if (id === NO_INICIAL) continue
      const saidas = no.acoes.filter((a) => !(a.tipo === 'no' && a.para === NO_INICIAL))
      expect(saidas.length, `nó "${id}" sem saída`).toBeGreaterThan(0)
    }
  })

  test('todo nó é alcançável a partir do início', () => {
    const visto = new Set([NO_INICIAL])
    const fila = [NO_INICIAL]
    while (fila.length) {
      for (const a of roteiro[fila.shift()!]!.acoes) {
        if (a.tipo === 'no' && !visto.has(a.para)) {
          visto.add(a.para)
          fila.push(a.para)
        }
      }
    }
    expect([...visto].sort()).toEqual(Object.keys(roteiro).sort())
  })

  test('a seção citada existe na landing', () => {
    for (const no of Object.values(roteiro)) {
      for (const a of no.acoes) {
        if (a.tipo === 'secao') expect(landing, `#${a.id}`).toContain(`id="${a.id}"`)
      }
    }
  })

  test('o chat cita os mesmos preços da constante', () => {
    const texto = roteiro.precos!.falas.join(' ')
    for (const plano of Object.values(PRECOS)) {
      expect(texto).toContain(`R$ ${plano[12]}`)
      expect(texto).toContain(`R$ ${plano[6]}`)
    }
  })

  test('a landing não tem preço digitado à mão', () => {
    // Se alguém voltar a escrever "R$ 149" no template, o chat e o card deixam
    // de ter uma fonte só.
    for (const plano of Object.values(PRECOS)) {
      for (const v of [plano[12], plano[6]]) {
        expect(landing, `R$ ${v} literal na landing`).not.toMatch(new RegExp(`R\\$ ?${v}\\b`))
      }
    }
  })
})
