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

/**
 * Detecta `/imovel/` fora de comentário, em qualquer forma de string — aspa
 * colada (`'/imovel/'`) ou interpolação (`` `${origin}/imovel/${code}` ``).
 *
 * Extraída para ser testada por si só: a versão anterior desta regex exigia
 * aspas/crase imediatamente antes de `/imovel/` e por isso não pegava a forma
 * interpolada — que era o padrão dominante no código do servidor. O guarda
 * ficava cego justamente para o caso mais comum, sem ninguém notar. O teste
 * abaixo (`containsRawImovelPath`) existe para que uma regex quebrada assim
 * seja pega aqui, e não descoberta meses depois com um link 404 no sitemap.
 */
function containsRawImovelPath(source: string): boolean {
  const semComentario = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  return /\/imovel\//.test(semComentario)
}

describe('caminho do imóvel vem sempre do helper', () => {
  for (const arquivo of ARQUIVOS) {
    test(`${arquivo} não monta /imovel/ na mão`, () => {
      const fonte = readFileSync(join(process.cwd(), arquivo), 'utf8')
      expect(containsRawImovelPath(fonte)).toBe(false)
    })
  }
})

describe('containsRawImovelPath (o detector, não os arquivos)', () => {
  test('pega a forma com aspas simples coladas', () => {
    expect(containsRawImovelPath(`const url = '/imovel/' + code`)).toBe(true)
  })

  test('pega a forma interpolada com crase — o padrão dominante no servidor', () => {
    expect(containsRawImovelPath('const url = `${origin}/imovel/${encodeURIComponent(p.code)}`')).toBe(true)
  })

  test('ignora ocorrência só dentro de comentário de linha', () => {
    expect(containsRawImovelPath('// URL antiga: /imovel/{codigo}')).toBe(false)
  })

  test('ignora ocorrência só dentro de comentário de bloco', () => {
    expect(containsRawImovelPath('/* formato antigo: /imovel/{codigo} */')).toBe(false)
  })

  test('não acusa código que não menciona /imovel/', () => {
    expect(containsRawImovelPath('const url = propertyPath(p)')).toBe(false)
  })
})
