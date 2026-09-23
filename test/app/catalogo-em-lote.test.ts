import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

/**
 * Toda página que mostra grade de imóveis corta em lotes.
 *
 * O lote nasceu só na home. Categoria e bairro ficaram de fora, e ninguém
 * percebeu porque não há erro nenhum em renderizar a lista inteira — o sintoma
 * aparece longe daqui: na maior imobiliária, `/imoveis/casas-a-venda` servia 56
 * cards e 479 KB de HTML, na página que a busca orgânica abre primeiro e quase
 * sempre no celular.
 *
 * Este teste existe porque o custo de esquecer é exatamente esse: invisível em
 * desenvolvimento, com dez imóveis de teste, e caro em produção.
 *
 * Não é teste de componente — o repositório não tem (ver vitest.config.ts). Ele
 * lê a fonte, como `property-url-callers.test.ts` faz com o caminho do imóvel.
 */
const PAGINAS_DE_GRADE = [
  'app/pages/index.vue',
  'app/pages/imoveis/[categoria].vue',
  'app/pages/imoveis/bairro/[bairro].vue',
]

describe('grade de imóveis sai em lote', () => {
  for (const arquivo of PAGINAS_DE_GRADE) {
    test(`${arquivo} usa loteDoCatalogo`, () => {
      const fonte = readFileSync(join(process.cwd(), arquivo), 'utf8')
      expect(fonte).toContain('loteDoCatalogo')
    })

    /**
     * O import sozinho não basta: dá para importar e continuar iterando a lista
     * toda no `v-for`, que é o estado em que a categoria estava.
     */
    test(`${arquivo} itera o lote, não a lista inteira`, () => {
      const fonte = readFileSync(join(process.cwd(), arquivo), 'utf8')
      const vFors = [...fonte.matchAll(/v-for="\(p, i\) in ([\w.]+)"/g)].map((m) => m[1])
      expect(vFors.length, 'nenhum v-for de card encontrado — o teste parou de olhar').toBeGreaterThan(0)
      for (const fonteDoLoop of vFors) {
        expect(fonteDoLoop, `${arquivo}: v-for sobre "${fonteDoLoop}"`).toBe('lote.visiveis')
      }
    })
  }
})
