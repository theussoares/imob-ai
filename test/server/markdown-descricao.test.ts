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
    expect(escaparMarkdown('- item')).not.toMatch(/^-\s/m)
    expect(escaparMarkdown('* item')).not.toMatch(/^\*\s/m)
    expect(escaparMarkdown('+ item')).not.toMatch(/^\+\s/m)
  })

  test('escapa ponto em lista numerada, não o dígito', () => {
    expect(escaparMarkdown('1. item')).toBe('1\\. item')
    expect(escaparMarkdown('2. dormitórios')).toBe('2\\. dormitórios')
    expect(escaparMarkdown('99. andar')).toBe('99\\. andar')
  })

  test('não mexe em hífen no meio da frase', () => {
    expect(escaparMarkdown('Casa bem-localizada, 3-4 quartos')).toBe('Casa bem-localizada, 3-4 quartos')
  })

  test('texto normal atravessa intacto', () => {
    const t = 'Casa ampla no Jardim Alvorada, com piscina e churrasqueira.'
    expect(escaparMarkdown(t)).toBe(t)
  })
})
