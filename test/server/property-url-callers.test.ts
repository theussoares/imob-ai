import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

/**
 * A URL do imóvel era montada à mão em oito lugares, e bastava um deles ficar
 * para trás numa mudança de formato para o sitemap publicar link que dá 404.
 * Este teste falha se alguém voltar a interpolar o caminho na unha.
 */
const ARQUIVOS = [
  'app/components/PropertyCard.vue',
  'app/pages/admin/leads/index.vue',
  'app/plugins/webmcp.client.ts',
  'server/routes/sitemap.xml.get.ts',
  'server/routes/feed/imoveis.xml.get.ts',
  'server/utils/markdown.ts',
  'server/middleware/agents.ts',
]

describe('caminho do imóvel vem sempre do helper', () => {
  for (const arquivo of ARQUIVOS) {
    test(`${arquivo} não monta /imovel/ na mão`, () => {
      const fonte = readFileSync(join(process.cwd(), arquivo), 'utf8')
      const semComentario = fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
      expect(semComentario).not.toMatch(/['"`]\/imovel\//)
    })
  }
})
