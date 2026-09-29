import { describe, expect, test } from 'vitest'
import { buildVrsyncFeed } from '~~/server/utils/vrsync-feed'
import { imovelCompleto } from '../helpers/imovel-completo'

/**
 * O XML que o Canal Pro lê.
 *
 * O feed antigo nunca teve teste, e passou meses sem `PostalCode` e `Address`
 * — o portal recusava todo anúncio e ninguém aqui via. Estes testes fixam os
 * elementos que o VRSync exige; não validam o XSD inteiro (o Grupo OLX não
 * publica um schema estável para baixar), então o que não está aqui não está
 * garantido.
 */

const contato = { name: 'Imóveis Exemplo', email: 'contato@exemplo.com', phone: '5567999990000' }

function feed(properties = [imovelCompleto()]) {
  return buildVrsyncFeed({
    providerName: 'Imóveis Exemplo',
    contato,
    properties,
    origin: 'https://www.exemplo.com.br',
    agora: new Date('2026-09-29T12:00:00.000Z'),
  })
}

describe('buildVrsyncFeed', () => {
  test('manda CEP (só dígitos), rua e número, mostrando só o bairro', () => {
    const { xml } = feed([imovelCompleto({ addressZip: '79600-000' })])
    expect(xml).toContain('<Location displayAddress="Neighborhood">')
    expect(xml).toContain('<PostalCode>79600000</PostalCode>')
    expect(xml).toContain('<Address>Rua Paranaíba</Address>')
    expect(xml).toContain('<StreetNumber>123</StreetNumber>')
    expect(xml).toContain('<State abbreviation="MS">Mato Grosso do Sul</State>')
  })

  test('traz UsageType, tipo, preço e área do jeito do VRSync', () => {
    const { xml } = feed()
    expect(xml).toContain('<UsageType>Residential</UsageType>')
    expect(xml).toContain('<PropertyType>Residential / Home</PropertyType>')
    expect(xml).toContain('<ListPrice currency="BRL">350000</ListPrice>')
    expect(xml).toContain('<LivingArea unit="square metres">180</LivingArea>')
    expect(xml).toContain('<TransactionType>For Sale</TransactionType>')
  })

  test('aluguel vai como RentalPrice mensal', () => {
    const { xml } = feed([imovelCompleto({ purpose: 'aluguel', price: 1800 })])
    expect(xml).toContain('<RentalPrice period="Monthly" currency="BRL">1800</RentalPrice>')
    expect(xml).toContain('<TransactionType>For Rent</TransactionType>')
  })

  test('terreno manda LotArea e nenhum cômodo', () => {
    const { xml } = feed([imovelCompleto({ type: 'terreno', bedrooms: 3 })])
    expect(xml).toContain('<LotArea unit="square metres">180</LotArea>')
    expect(xml).not.toContain('<Bedrooms>')
  })

  // Mandar o anúncio incompleto só gera erro no relatório do portal, que o
  // cliente não lê. Fora do feed, o painel diz o que falta.
  test('imóvel com pendência fica fora e é contado', () => {
    const r = feed([imovelCompleto(), imovelCompleto({ id: 'p2', code: 'SEM-CEP', addressZip: null })])
    expect(r.incluidos).toBe(1)
    expect(r.excluidos).toBe(1)
    expect(r.xml).not.toContain('SEM-CEP')
  })

  test('escapa texto do cadastro', () => {
    const { xml } = feed([imovelCompleto({ title: 'Casa <linda> & "ampla"' })])
    expect(xml).toContain('<Title>Casa &lt;linda&gt; &amp; &quot;ampla&quot;</Title>')
  })

  test('corta título acima de 100 caracteres em vez de ter o anúncio recusado', () => {
    const { xml } = feed([imovelCompleto({ title: 'x'.repeat(150) })])
    const titulo = /<Title>(.*?)<\/Title>/.exec(xml)?.[1] ?? ''
    expect(titulo.length).toBeLessThanOrEqual(100)
  })

  test('link do anúncio aponta para a página do imóvel no site', () => {
    const { xml } = feed()
    expect(xml).toMatch(/<DetailViewUrl>https:\/\/www\.exemplo\.com\.br\/[^<]+\/NC-0231<\/DetailViewUrl>/)
  })

  // O feed lê o modelo com endereço. Dono, telefone do dono e a anotação livre
  // de localização não têm o que fazer num portal, mesmo se chegarem no modelo.
  test('não publica dado interno que não seja o endereço', () => {
    const { xml } = feed([
      imovelCompleto({ ownerName: 'Dono Silva', ownerPhone: '5567988887777', location: 'chave com o vizinho' }),
    ])
    expect(xml).not.toContain('Dono Silva')
    expect(xml).not.toContain('5567988887777')
    expect(xml).not.toContain('chave com o vizinho')
  })
})
