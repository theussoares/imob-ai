import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

/**
 * A Área do Cliente fica fora do índice.
 *
 * Página de login indexada não traz visita — traz ruído no SEO que o site
 * trabalhou para construir, e coloca a marca da imobiliária numa busca que
 * termina em "não consigo entrar". O card 2.4 pede para CONFERIR isso; este
 * arquivo é a conferência que continua valendo depois.
 *
 * Duas frentes, porque uma não cobre a outra: `noindex` diz ao robô para não
 * listar, e o sitemap é o convite explícito para listar. Publicar a URL no
 * sitemap e marcá-la noindex é pedir indexação de uma página que se recusa a
 * ser indexada — a mesma contradição que o teste das categorias já guarda.
 */

const PAGES_DIR = join(process.cwd(), 'app/pages/area-cliente')

/** Todo .vue sob app/pages/area-cliente, inclusive os de subpasta. */
function paginasDoPortal(dir = PAGES_DIR, prefixo = ''): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const caminho = join(dir, entry.name)
    if (entry.isDirectory()) return paginasDoPortal(caminho, `${prefixo}${entry.name}/`)
    return entry.name.endsWith('.vue') ? [`${prefixo}${entry.name}`] : []
  })
}

describe('noindex em toda tela da Área do Cliente', () => {
  const paginas = paginasDoPortal()

  test('existe ao menos uma página para conferir', () => {
    // Sem isto, um refactor que mova as páginas faria a suíte passar vazia.
    expect(paginas.length).toBeGreaterThan(0)
  })

  test.each(paginasDoPortal())('%s declara noindex', (pagina) => {
    const fonte = readFileSync(join(PAGES_DIR, pagina), 'utf8')
    expect(fonte).toMatch(/robots:\s*["']noindex/)
  })
})

describe('a Área do Cliente não entra no sitemap', () => {
  test('o sitemap não menciona area-cliente', () => {
    /*
     * O sitemap é montado a partir de uma lista EXPLÍCITA (home, quero-vender,
     * categorias, imóveis). Nada varre as rotas do app, então a área do cliente
     * está fora por construção — e este teste existe para que continue assim se
     * alguém trocar a lista por uma varredura automática.
     */
    const fonte = readFileSync(join(process.cwd(), 'server/routes/sitemap.xml.get.ts'), 'utf8')
    expect(fonte).not.toMatch(/area-cliente/)
  })
})
