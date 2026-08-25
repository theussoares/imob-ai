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

  // Rotas de API e o feed XML também têm dois segmentos — sem a exclusão, o
  // feed que vai para portais externos ganharia Vary: Accept em silêncio.
  test('/api/properties não é imóvel', () => {
    expect(isPropertyPath('/api/properties')).toBe(false)
  })

  test('/api/tenant não é imóvel', () => {
    expect(isPropertyPath('/api/tenant')).toBe(false)
  })

  test('/feed/imoveis.xml não é imóvel', () => {
    expect(isPropertyPath('/feed/imoveis.xml')).toBe(false)
  })

  test('/.well-known/api-catalog não é imóvel', () => {
    expect(isPropertyPath('/.well-known/api-catalog')).toBe(false)
  })
})
