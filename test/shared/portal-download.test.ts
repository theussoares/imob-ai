import { describe, expect, test } from 'vitest'
import { nomeDeDownload } from '~~/shared/utils/portal-download'

/**
 * O nome do arquivo que chega no celular da pessoa. (A checagem de uuid, que
 * era testada aqui, mudou-se para `test/shared/uuid.test.ts` junto com a
 * função — ela não é do download.)
 */

describe('nomeDeDownload — o nome que chega no celular da pessoa', () => {
  test('usa o título e a extensão do arquivo no bucket', () => {
    expect(nomeDeDownload('Contrato de locação', 'olmi/ct-1/abc123.pdf')).toBe(
      'Contrato de locação.pdf',
    )
  })

  test('não duplica a extensão que o título já tem', () => {
    expect(nomeDeDownload('Laudo.pdf', 'olmi/ct-1/x.pdf')).toBe('Laudo.pdf')
    expect(nomeDeDownload('Laudo.PDF', 'olmi/ct-1/x.pdf')).toBe('Laudo.PDF')
  })

  test('tira o que quebraria o cabeçalho', () => {
    // O título é digitado no painel pela imobiliária e vai para um
    // `Content-Disposition`. Barra, aspas e quebra de linha saem antes.
    const sujo = 'Recibo\r\nBcc: alguem@exemplo.com'
    const saida = nomeDeDownload(sujo, 'olmi/ct-1/r.pdf')
    expect(saida).not.toMatch(/[\r\n"\\/]/)
    expect(saida).toContain('Recibo')
  })

  test('título vazio ainda dá um nome', () => {
    expect(nomeDeDownload('', 'olmi/ct-1/x.pdf')).toBe('documento.pdf')
    expect(nomeDeDownload('   ', 'olmi/ct-1/x.pdf')).toBe('documento.pdf')
  })

  test('não inventa extensão a partir de ponto no meio do nome', () => {
    expect(nomeDeDownload('Extrato', 'olmi/ct-1/arquivo.de.janeiro')).toBe('Extrato')
    expect(nomeDeDownload('Extrato', 'olmi/ct-1/semponto')).toBe('Extrato')
  })

  test('nome longo não vira cabeçalho gigante', () => {
    expect(nomeDeDownload('a'.repeat(400), 'olmi/ct-1/x.pdf').length).toBeLessThanOrEqual(124)
  })
})
