import { describe, expect, test } from 'vitest'
import { filtrarEvento, urlRastreavel } from '~~/shared/utils/rastreio'

// A ameaça: a URL de cada visita vai para a Vercel. Na Área do Cliente ela
// carrega o id do contrato de uma pessoa real — e na de redefinir senha, o
// token. No painel, é uso interno contado como visita de cliente.

describe('urlRastreavel', () => {
  test('descarta o host do painel', () => {
    expect(urlRastreavel('https://painel.olmiimoveis.com.br/admin/leads')).toBeNull()
    expect(urlRastreavel('https://painel.olmiimoveis.com.br/')).toBeNull()
  })

  test('descarta /admin e a Área do Cliente em qualquer host', () => {
    expect(urlRastreavel('https://www.olmiimoveis.com.br/admin')).toBeNull()
    expect(urlRastreavel('https://www.olmiimoveis.com.br/admin/imoveis/1')).toBeNull()
    expect(urlRastreavel('https://www.olmiimoveis.com.br/area-cliente')).toBeNull()
    expect(urlRastreavel('https://www.olmiimoveis.com.br/area-cliente/contratos/7b1f3c1e-0000-4000-8000-000000000000')).toBeNull()
    expect(urlRastreavel('https://www.olmiimoveis.com.br/area-cliente/redefinir?token=segredo')).toBeNull()
  })

  test('não confunde rota pública que só começa parecido', () => {
    expect(urlRastreavel('https://www.olmiimoveis.com.br/administracao-de-imoveis')).not.toBeNull()
  })

  test('tira a query, menos utm_*, e o #', () => {
    expect(urlRastreavel('https://www.olmiimoveis.com.br/imoveis/a-venda?q=joao%40email.com&utm_source=insta&utm_campaign=set#top')).toBe(
      'https://www.olmiimoveis.com.br/imoveis/a-venda?utm_source=insta&utm_campaign=set',
    )
    expect(urlRastreavel('https://www.olmiimoveis.com.br/?tel=67991234567')).toBe('https://www.olmiimoveis.com.br/')
  })

  test('URL inválida é descartada, não repassada', () => {
    expect(urlRastreavel('não é url')).toBeNull()
  })
})

describe('filtrarEvento', () => {
  test('preserva os outros campos do evento e troca só a url', () => {
    const r = filtrarEvento({ type: 'pageview', url: 'https://www.olmiimoveis.com.br/?x=1' })
    expect(r).toEqual({ type: 'pageview', url: 'https://www.olmiimoveis.com.br/' })
  })

  test('evento de página privada vira null (descartado)', () => {
    expect(filtrarEvento({ type: 'event', url: 'https://www.olmiimoveis.com.br/area-cliente' })).toBeNull()
  })
})
