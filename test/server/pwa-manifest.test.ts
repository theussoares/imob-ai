import { describe, expect, test } from 'vitest'
import { buildPanelManifest, isPwaPath } from '~~/server/utils/pwa'
import { safeBrandColor } from '~~/server/utils/brand'

describe('manifest do painel', () => {
  test('leva o nome da imobiliária', () => {
    const m = buildPanelManifest('Olmi Imóveis', '#123456')
    expect(m.name).toBe('Painel · Olmi Imóveis')
    expect(m.description).toBe('Painel de gestão de Olmi Imóveis')
    expect(m.theme_color).toBe('#123456')
  })

  test('sem tenant, não repete a palavra nem inventa nome', () => {
    // O banco pode estar fora — a rota cai no fallback em vez de dar 500. A
    // primeira versão usava a string 'Painel' como sentinela e rendia
    // "Painel de gestão de Painel".
    const m = buildPanelManifest(null, '#0f3d38')
    expect(m.name).toBe('Painel')
    expect(m.short_name).toBe('Painel')
    expect(m.description).toBe('Painel de gestão')
  })

  test('imobiliária chamada "Painel" é tratada como nome, não como ausência', () => {
    const m = buildPanelManifest('Painel', '#0f3d38')
    expect(m.name).toBe('Painel · Painel')
  })

  test('short_name é cortado — é o rótulo embaixo do ícone', () => {
    const m = buildPanelManifest('Imobiliária Três Lagoas', '#0f3d38')
    expect(m.short_name.length).toBeLessThanOrEqual(12)
    expect(m.short_name).toBe('Imobiliária')
  })

  test('nome só com espaços cai no fallback', () => {
    expect(buildPanelManifest('   ', '#0f3d38').name).toBe('Painel')
  })

  test('tem os ícones que a instalação exige', () => {
    // 192 e 512 em PNG são o mínimo do Chromium; o maskable evita que o Android
    // corte o conteúdo ao aplicar a máscara dele.
    const m = buildPanelManifest('X', '#0f3d38')
    const sizes = m.icons.map((i) => `${i.sizes}:${i.purpose}`)
    expect(sizes).toContain('192x192:any')
    expect(sizes).toContain('512x512:any')
    expect(sizes).toContain('512x512:maskable')
    expect(m.icons.every((i) => i.type === 'image/png')).toBe(true)
  })

  test('escopo é a raiz, porque a origem inteira é o painel', () => {
    const m = buildPanelManifest('X', '#0f3d38')
    expect(m.scope).toBe('/')
    expect(m.start_url).toBe('/admin')
  })
})

describe('cor de marca', () => {
  test('recusa o que não é hex', () => {
    // brand_primary é texto livre no banco, e um valor inválido faria o
    // navegador recusar o manifest sem dizer por quê.
    expect(safeBrandColor('vermelho')).toBe('#0f3d38')
    expect(safeBrandColor('')).toBe('#0f3d38')
    expect(safeBrandColor(null)).toBe('#0f3d38')
    expect(safeBrandColor('#12')).toBe('#0f3d38')
  })

  test('aceita hex em 3, 6 e 8 dígitos', () => {
    expect(safeBrandColor('#abc')).toBe('#abc')
    expect(safeBrandColor('#AABBCC')).toBe('#AABBCC')
    expect(safeBrandColor('#aabbccdd')).toBe('#aabbccdd')
  })
})

describe('rotas do PWA no middleware', () => {
  test('manifest e service worker escapam do redirect do painel', () => {
    // Sem isso, admin-host.ts responde 302 para /admin no lugar deles: o
    // navegador pede o manifest e recebe HTML, e o SW nem registra.
    expect(isPwaPath('/manifest.webmanifest')).toBe(true)
    expect(isPwaPath('/sw.js')).toBe(true)
    expect(isPwaPath('/workbox-2fbc6a65.js')).toBe(true)
  })

  test('não abre a mão para rota qualquer', () => {
    expect(isPwaPath('/imovel/casa-3-quartos/NC-0231')).toBe(false)
    expect(isPwaPath('/')).toBe(false)
    expect(isPwaPath('/sw.js.map')).toBe(false)
  })
})
