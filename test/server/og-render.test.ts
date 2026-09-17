import { describe, expect, test } from 'vitest'
import sharp from 'sharp'
import { frameOgCard } from '~~/server/utils/og-render'

/**
 * Testes do enquadramento do card social. Sem rede: as imagens de entrada são
 * geradas aqui, porque o que precisa de cobertura é a DECISÃO entre cortar e
 * preservar — não o download.
 */

/**
 * Imagem verde com duas faixas-marcador FINAS: vermelha rente ao topo, azul
 * rente à base.
 *
 * Finas (2% da altura) de propósito: é o que separa cortar de preservar. Uma
 * foto 16:9 encaixada em 1,91:1 perde só ~3% da altura, então faixa grossa
 * sobreviveria ao corte e o teste passaria nos dois casos sem provar nada.
 */
async function faixas(width: number, height: number): Promise<Buffer> {
  const terco = Math.max(1, Math.round(height * 0.02))
  return sharp({ create: { width, height, channels: 3, background: '#00ff00' } })
    .composite([
      { input: { create: { width, height: terco, channels: 3, background: '#ff0000' } }, top: 0, left: 0 },
      {
        input: { create: { width, height: terco, channels: 3, background: '#0000ff' } },
        top: height - terco,
        left: 0,
      },
    ])
    .png()
    .toBuffer()
}

/** Cor de um pixel do card renderizado, em [r, g, b]. */
async function pixel(card: Buffer, x: number, y: number): Promise<[number, number, number]> {
  const { data } = await sharp(card).extract({ left: x, top: y, width: 1, height: 1 }).raw().toBuffer({
    resolveWithObject: true,
  })
  return [data[0]!, data[1]!, data[2]!]
}

const dominante = ([r, g, b]: [number, number, number]) =>
  r > g && r > b ? 'vermelho' : b > r && b > g ? 'azul' : 'verde'

describe('frameOgCard', () => {
  // O formato é o ponto de partida de tudo: o WhatsApp não renderiza WebP em
  // preview, e as fotos do painel são todas WebP.
  test('sai sempre em JPEG 1200x630, seja qual for a entrada', async () => {
    for (const [w, h] of [
      [1600, 900],
      [1080, 1350],
      [800, 800],
    ] as const) {
      const meta = await sharp(await frameOgCard(await faixas(w, h), 'photo', '#0f3d38')).metadata()
      expect([meta.format, meta.width, meta.height]).toEqual(['jpeg', 1200, 630])
    }
  })

  // Foto em paisagem pode perder céu e chão sem perder o imóvel: as faixas
  // rentes às bordas somem no corte, o miolo continua lá.
  test('foto em paisagem é cortada nas pontas', async () => {
    const card = await frameOgCard(await faixas(1600, 900), 'photo', '#0f3d38')

    expect(dominante(await pixel(card, 600, 3))).toBe('verde')
    expect(dominante(await pixel(card, 600, 315))).toBe('verde')
    expect(dominante(await pixel(card, 600, 626))).toBe('verde')
  })

  /**
   * O caso que motivou a regra: imagem em pé num catálogo de imóvel quase nunca
   * é foto — é a arte pronta do Canva, com o título em cima e o preço embaixo.
   * Cortar para 1,91:1 comia exatamente essas duas pontas.
   */
  test('arte em pé entra inteira: topo e rodapé sobrevivem', async () => {
    const card = await frameOgCard(await faixas(1080, 1350), 'photo', '#0f3d38')

    expect(dominante(await pixel(card, 600, 3))).toBe('vermelho')
    expect(dominante(await pixel(card, 600, 315))).toBe('verde')
    expect(dominante(await pixel(card, 600, 626))).toBe('azul')
  })

  // Quadrada também não pode ser cortada nas pontas — cai na mesma regra.
  test('imagem quadrada também entra inteira', async () => {
    const card = await frameOgCard(await faixas(1000, 1000), 'photo', '#0f3d38')

    expect(dominante(await pixel(card, 600, 3))).toBe('vermelho')
    expect(dominante(await pixel(card, 600, 626))).toBe('azul')
  })

  /**
   * JPEG não tem canal alfa. Sem `flatten` explícito, o encoder preenche o
   * transparente da logo com PRETO — e a logo do cliente aparecia numa mancha
   * preta no WhatsApp, não na cor da marca dele.
   */
  test('transparência da logo vira a cor da marca, não preto', async () => {
    const logo = await sharp({
      create: { width: 400, height: 400, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .toBuffer()

    const card = await frameOgCard(logo, 'logo', '#ff0000')

    // Canto (margem) e centro (área transparente da logo): os dois na cor da marca.
    expect(dominante(await pixel(card, 5, 5))).toBe('vermelho')
    expect(dominante(await pixel(card, 600, 315))).toBe('vermelho')
  })

  // Uma exceção aqui significa preview SEM imagem — exatamente o que a rota /og
  // existe para corrigir. Entrada inválida tem que virar o card da marca.
  test('bytes que não são imagem viram o card da marca, sem lançar', async () => {
    const card = await frameOgCard(Buffer.from('isto não é uma imagem'), 'photo', '#ff0000')

    expect((await sharp(card).metadata()).width).toBe(1200)
    expect(dominante(await pixel(card, 600, 315))).toBe('vermelho')
  })

  test('sem bytes nenhum também vira o card da marca', async () => {
    const card = await frameOgCard(null, 'photo', '#ff0000')

    expect(dominante(await pixel(card, 600, 315))).toBe('vermelho')
  })

  // A cor vem do banco e vai parar dentro do SVG/pipeline; qualquer coisa que
  // não seja hex cai no verde padrão da plataforma.
  test('cor de marca inválida não quebra o card', async () => {
    const card = await frameOgCard(null, 'photo', 'javascript:alert(1)')

    expect((await sharp(card).metadata()).width).toBe(1200)
  })
})
