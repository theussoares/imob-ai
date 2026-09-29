import { describe, expect, test } from 'vitest'
import type { Property } from '~~/shared/models/property'
import { pendenciasVrsync, usageTypeVrsync } from '~~/shared/utils/vrsync'
import { imovelCompleto } from '../helpers/imovel-completo'

/**
 * A regra de "o Canal Pro aceita este anúncio?".
 *
 * O feed ficou no ar sem CEP nem rua e o portal recusava tudo; o painel dizia
 * que a integração existia. Estes testes fixam o que é pendência, porque é a
 * mesma função que decide o que entra no feed e o que o painel avisa — se ela
 * afrouxar, volta o anúncio recusado em silêncio; se apertar sem motivo, some
 * do portal imóvel que ele aceitaria.
 */

describe('pendenciasVrsync', () => {
  test('imóvel completo não tem pendência', () => {
    expect(pendenciasVrsync(imovelCompleto())).toEqual([])
  })

  // O defeito que motivou tudo: sem CEP e rua o Canal Pro recusa o anúncio.
  test('sem CEP nem rua é pendência — o motivo de o feed nunca ter funcionado', () => {
    const p = pendenciasVrsync(imovelCompleto({ addressZip: null, addressStreet: null }))
    expect(p).toContain('Falta o CEP')
    expect(p).toContain('Falta a rua')
  })

  test('CEP aceita máscara, mas precisa dos 8 dígitos', () => {
    expect(pendenciasVrsync(imovelCompleto({ addressZip: '79600-000' }))).toEqual([])
    expect(pendenciasVrsync(imovelCompleto({ addressZip: '7960000' }))).toContain('Falta o CEP')
  })

  test('número é opcional (lote sem número existe)', () => {
    expect(pendenciasVrsync(imovelCompleto({ addressNumber: null }))).toEqual([])
  })

  // Em produção uma imobiliária inteira (20 de 20) tinha descrição curta: sem
  // este aviso ela ficaria sem nenhum anúncio e sem saber por quê.
  test('descrição abaixo de 50 caracteres diz quanto falta', () => {
    const p = pendenciasVrsync(imovelCompleto({ description: 'Casa boa.' }))
    expect(p).toEqual(['Descrição curta demais (9 de 50 caracteres)'])
    expect(pendenciasVrsync(imovelCompleto({ description: null }))).toEqual(['Falta a descrição'])
  })

  test('bairro, cidade, UF, preço, área e foto são exigidos', () => {
    const p = pendenciasVrsync(
      imovelCompleto({ neighborhood: null, city: '', state: null, price: 0, area: 0, images: [] }),
    )
    expect(p).toEqual([
      'Falta o bairro',
      'Falta a cidade',
      'Falta o estado (UF)',
      'Falta o preço',
      'Falta a área',
      'Falta ao menos uma foto',
    ])
  })
})

describe('usageTypeVrsync', () => {
  test('segue o prefixo do tipo VRSync do registro', () => {
    expect(usageTypeVrsync({ type: 'casa' })).toBe('Residential')
    expect(usageTypeVrsync({ type: 'sala' })).toBe('Commercial')
  })
})
