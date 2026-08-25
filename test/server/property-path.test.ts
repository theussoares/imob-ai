import { describe, expect, test } from 'vitest'
import { isPropertyPath } from '~~/server/utils/property-path'

describe('isPropertyPath', () => {
  test('slug + código é detalhe de imóvel', () => {
    expect(isPropertyPath('/casa-3-quartos-centro/NC-0231')).toBe(true)
  })

  // Rota de dois segmentos também — sem esta exclusão, o painel passaria a
  // anunciar Link headers de descoberta de agentes numa área privada.
  test('/admin/leads não é imóvel', () => {
    expect(isPropertyPath('/admin/leads')).toBe(false)
  })

  test('/admin/imoveis não é imóvel', () => {
    expect(isPropertyPath('/admin/imoveis')).toBe(false)
  })

  test('/imoveis/a-venda (categoria) não é imóvel', () => {
    expect(isPropertyPath('/imoveis/a-venda')).toBe(false)
  })

  test('/imoveis/casas-a-venda (categoria) não é imóvel', () => {
    expect(isPropertyPath('/imoveis/casas-a-venda')).toBe(false)
  })

  test('home não é imóvel', () => {
    expect(isPropertyPath('/')).toBe(false)
  })

  test('um segmento só não é imóvel', () => {
    expect(isPropertyPath('/quero-vender')).toBe(false)
  })

  test('três segmentos não é imóvel', () => {
    expect(isPropertyPath('/a/b/c')).toBe(false)
  })
})
