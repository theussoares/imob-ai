import { describe, expect, test } from 'vitest'
import { legacyRedirectFor } from '~~/server/utils/legacy-urls'

const imovel = { type: 'casa' as const, bedrooms: 3, neighborhood: 'Centro', code: 'NC-0231' }
const lookup = (code: string) => (code.toLowerCase() === 'nc-0231' ? imovel : null)

describe('legacyRedirectFor', () => {
  test('/imovel/{codigo} vai para a URL nova', () => {
    expect(legacyRedirectFor('/imovel/NC-0231', {}, lookup)).toBe('/casa-3-quartos-centro/NC-0231')
  })

  // A busca por código sempre foi case-insensitive; o redirect não pode
  // introduzir um 404 que não existia.
  test('código em caixa diferente também redireciona', () => {
    expect(legacyRedirectFor('/imovel/nc-0231', {}, lookup)).toBe('/casa-3-quartos-centro/NC-0231')
  })

  test('código com espaço, vindo percent-encoded', () => {
    const outro = { type: 'terreno' as const, bedrooms: 0, neighborhood: null, code: 'V.D 005' }
    const l = (c: string) => (c === 'V.D 005' ? outro : null)
    expect(legacyRedirectFor('/imovel/V.D%20005', {}, l)).toBe('/terreno/V.D%20005')
  })

  test('código inexistente não redireciona — segue para o 404 normal', () => {
    expect(legacyRedirectFor('/imovel/NAO-EXISTE', {}, lookup)).toBeNull()
  })

  test('?purpose=aluguel na home vai para a página de pretensão', () => {
    expect(legacyRedirectFor('/', { purpose: 'aluguel' }, lookup)).toBe('/imoveis/para-alugar')
  })

  test('?purpose=venda também, para não deixar duas URLs do mesmo conteúdo', () => {
    expect(legacyRedirectFor('/', { purpose: 'venda' }, lookup)).toBe('/imoveis/a-venda')
  })

  test('home sem query não redireciona', () => {
    expect(legacyRedirectFor('/', {}, lookup)).toBeNull()
  })

  test('purpose desconhecido é ignorado', () => {
    expect(legacyRedirectFor('/', { purpose: 'qualquer' }, lookup)).toBeNull()
  })

  test('outras rotas passam batido', () => {
    expect(legacyRedirectFor('/imoveis/a-venda', {}, lookup)).toBeNull()
    expect(legacyRedirectFor('/casa-3-quartos-centro/NC-0231', {}, lookup)).toBeNull()
  })
})
