import { describe, expect, test } from 'vitest'
import type { PropertyInput } from '~~/shared/models/property'
import { updateProperty, deleteProperty } from '~~/server/repositories/property.repository'
import { propertyImagePath } from '~~/server/utils/storage'
import { fakeSupabase, removedPaths } from '../helpers/fake-supabase'

const BASE = 'https://eixzfjmmcocuxnprqskf.supabase.co/storage/v1/object/public/property-images/'

const url = (arquivo: string) => `${BASE}tatiane/${arquivo}`

/** Uma foto como o banco devolve (grande + miniatura). */
const linha = (nome: string) => ({ url: url(`${nome}.webp`), url_sm: url(`${nome}@sm.webp`) })

/** A mesma foto como o formulário manda de volta. */
const foto = (nome: string) => ({ url: url(`${nome}.webp`), urlSm: url(`${nome}@sm.webp`) })

const paths = (nome: string) => [`tatiane/${nome}.webp`, `tatiane/${nome}@sm.webp`]

function input(images: unknown[]): PropertyInput {
  return {
    code: 'VD-001',
    title: 'Casa Leon',
    type: 'casa',
    purpose: 'venda',
    price: 350000,
    images,
  } as PropertyInput
}

/** Sequência que `updateProperty` consome: update, depois a releitura do imóvel. */
const propertiesOk = [
  { data: [{ id: 'p1' }], error: null },
  { data: { id: 'p1', broker_id: null, property_images: [] }, error: null },
]

describe('propertyImagePath', () => {
  test('extrai o path do arquivo dentro do bucket', () => {
    expect(propertyImagePath(url('1786807603229-abc.webp'))).toBe('tatiane/1786807603229-abc.webp')
  })

  test('ignora URL que não é do nosso bucket', () => {
    // O uploader aceita URL colada à mão e a seed usa Unsplash: mandar isso para
    // o `remove()` não apagaria nada e ainda encheria o retorno de erro.
    expect(propertyImagePath('https://images.unsplash.com/photo-1568605114967?w=1200')).toBeNull()
    expect(propertyImagePath(`${BASE.replace('property-images', 'tenant-logos')}olmi/logo.webp`)).toBeNull()
  })

  test('descarta a querystring — o objeto no bucket é o mesmo', () => {
    expect(propertyImagePath(url('abc.webp') + '?width=360&quality=70')).toBe('tatiane/abc.webp')
  })

  test('aceita ausência de valor (url_sm é anulável)', () => {
    expect(propertyImagePath(null)).toBeNull()
    expect(propertyImagePath(undefined)).toBeNull()
    expect(propertyImagePath('')).toBeNull()
  })
})

describe('replaceImages — limpeza do Storage no salvamento', () => {
  test('apaga do bucket só a foto que saiu da edição', async () => {
    const { client, removals } = fakeSupabase({
      properties: propertiesOk,
      property_images: [{ data: [linha('a'), linha('b')], error: null }],
    })

    await updateProperty(client, 't1', 'p1', input([foto('a')]))

    expect(removedPaths(removals)).toEqual(paths('b'))
  })

  test('não encosta na foto que continua no imóvel', async () => {
    // O estrago que este teste existe para impedir: apagar um arquivo que a
    // linha nova ainda referencia deixa imagem quebrada no site do cliente —
    // pior que o órfão que a limpeza está evitando.
    const { client, removals } = fakeSupabase({
      properties: propertiesOk,
      property_images: [{ data: [linha('a')], error: null }],
    })

    await updateProperty(client, 't1', 'p1', input([foto('a')]))

    expect(removedPaths(removals)).toEqual([])
  })

  test('apaga tudo quando o imóvel fica sem nenhuma foto', async () => {
    // Antes havia um early return quando a lista nova era vazia: quem removia
    // todas as fotos deixava o bucket intacto.
    const { client, removals } = fakeSupabase({
      properties: propertiesOk,
      property_images: [{ data: [linha('a'), linha('b')], error: null }],
    })

    await updateProperty(client, 't1', 'p1', input([]))

    expect(removedPaths(removals).sort()).toEqual([...paths('a'), ...paths('b')].sort())
  })

  test('não manda URL externa para o Storage', async () => {
    const { client, removals } = fakeSupabase({
      properties: propertiesOk,
      property_images: [
        { data: [{ url: 'https://images.unsplash.com/photo-1568605114967', url_sm: null }], error: null },
      ],
    })

    await updateProperty(client, 't1', 'p1', input([]))

    expect(removals).toEqual([])
  })
})

describe('deleteProperty — limpeza do Storage na exclusão', () => {
  test('apaga as fotos do imóvel excluído', async () => {
    // As linhas somem por cascade junto com o imóvel, então os paths precisam
    // ser lidos antes — depois não há de onde tirá-los.
    const { client, removals } = fakeSupabase({
      property_images: [{ data: [linha('a')], error: null }],
      properties: [{ data: [{ id: 'p1' }], error: null }],
    })

    await deleteProperty(client, 't1', 'p1')

    expect(removedPaths(removals)).toEqual(paths('a'))
  })

  test('não apaga nada quando o delete não pega linha nenhuma', async () => {
    // Imóvel de outro tenant (ou já apagado). Seguir para a limpeza aqui
    // destruiria as fotos de um imóvel vivo de outra imobiliária.
    const { client, removals } = fakeSupabase({
      property_images: [{ data: [linha('a')], error: null }],
      properties: [{ data: [], error: null }],
    })

    await deleteProperty(client, 't1', 'p1')

    expect(removals).toEqual([])
  })
})
