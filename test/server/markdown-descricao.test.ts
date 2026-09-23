import { describe, expect, test } from 'vitest'
import { escaparMarkdown } from '~~/server/utils/markdown'

/**
 * A descrição entra CRUA no documento servido em `Accept: text/markdown` e no
 * `llms.txt` — que é o artefato que este produto vende como preparo para busca
 * por IA. Uma descrição gerada com `## ` reestrutura esse documento.
 *
 * Não é XSS (o site interpola com `{{ }}` e o Vue escapa). É corrupção do
 * diferencial.
 */
describe('escaparMarkdown', () => {
  test('neutraliza heading no início de linha', () => {
    expect(escaparMarkdown('## Sobre\ntexto')).not.toMatch(/^## /m)
  })

  test('neutraliza item de lista no início de linha', () => {
    for (const marca of ['- item', '* item', '+ item', '1. item']) {
      expect(escaparMarkdown(marca)).not.toMatch(/^[-*+]\s|^\d+\.\s/m)
    }
  })

  test('não mexe em hífen no meio da frase', () => {
    expect(escaparMarkdown('Casa bem-localizada, 3-4 quartos')).toBe('Casa bem-localizada, 3-4 quartos')
  })

  test('texto normal atravessa intacto', () => {
    const t = 'Casa ampla no Jardim Alvorada, com piscina e churrasqueira.'
    expect(escaparMarkdown(t)).toBe(t)
  })
})
