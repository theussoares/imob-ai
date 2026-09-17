import { describe, expect, test } from 'vitest'
import { ehUuid, nomeDeDownload } from '~~/shared/utils/portal-download'

/**
 * As duas peças puras do download. Pequenas, e cada uma fecha um jeito
 * específico de o endpoint responder errado.
 */

describe('ehUuid — id malformado é 404, não 500', () => {
  test('aceita o que o banco de fato guarda', () => {
    expect(ehUuid('0f5f4d2e-1c3a-4b5d-8e9f-a1b2c3d4e5f6')).toBe(true)
    expect(ehUuid('0F5F4D2E-1C3A-4B5D-8E9F-A1B2C3D4E5F6')).toBe(true)
    expect(ehUuid('  0f5f4d2e-1c3a-4b5d-8e9f-a1b2c3d4e5f6  ')).toBe(true)
  })

  test('recusa o que faria o Postgres devolver 22P02', () => {
    // Cada um destes chega em `.eq('id', ...)` numa coluna `uuid`. Sem esta
    // checagem o repositório dá `throw error` e o handler responde 500 — que,
    // além de errado, distingue o id de um que simplesmente não existe.
    for (const ruim of [
      '',
      '   ',
      'nao-e-uuid',
      '../../etc/passwd',
      "1' or '1'='1",
      '0f5f4d2e-1c3a-4b5d-8e9f',
      '0f5f4d2e-1c3a-4b5d-8e9f-a1b2c3d4e5f6-extra',
      'g0f5f4d2-1c3a-4b5d-8e9f-a1b2c3d4e5f6',
    ]) {
      expect(ehUuid(ruim), `aceitou ${JSON.stringify(ruim)}`).toBe(false)
    }
  })
})

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
