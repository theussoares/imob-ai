import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import type { Property } from '~~/shared/models/property'
import { lerCorpoImovel, toImovelGestao, toPropertyInput } from '~~/server/mappers/gestao-imovel'
import { decodificarFoto, FOTOS_POR_ENVIO_MAX, prepararFotos, tipoPelosBytes, armazenarFotoImovel } from '~~/server/utils/gestao-fotos'
import {
  deletePropertyImage,
  insertPropertyImages,
  listAllProperties,
  updatePropertyImageOrder,
  updatePropertySemImagens,
} from '~~/server/repositories/property.repository'
import { fakeSupabase, hadEq, touched } from '../helpers/fake-supabase'
import { stripComments } from '../helpers/strip-comments'

const b64 = (s: string | Buffer, tipo = 'webp') => `data:image/${tipo};base64,${Buffer.from(s as never, 'latin1').toString('base64')}`
const WEBP = 'RIFF\0\0\0\0WEBPdados'
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])

describe('foto: o que o servidor aceita no Storage público', () => {
  test('tipo vem dos bytes: WebP e JPEG passam; SVG, HTML, PNG e GIF não', () => {
    expect(tipoPelosBytes(Buffer.from(WEBP, 'latin1'))).toBe('image/webp')
    expect(tipoPelosBytes(JPEG)).toBe('image/jpeg')
    for (const ruim of ['<svg xmlns="http://www.w3.org/2000/svg"/>', '<html><script>alert(1)</script>', 'GIF89a....', '\x89PNG\r\n\x1a\n']) {
      expect(tipoPelosBytes(Buffer.from(ruim, 'latin1'))).toBeNull()
    }
  })

  test('cabeçalho mentindo (data:image/jpeg com SVG dentro) é recusado', () => {
    expect(decodificarFoto(b64('<svg onload=alert(1)>', 'jpeg'), 600_000).ok).toBe(false)
  })

  test('só data URL de webp/jpeg em base64; texto, URL externa e svg+xml não', () => {
    for (const ruim of ['https://evil/x.jpg', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:text/html;base64,PGh0bWw+', 123, null, undefined]) {
      expect(decodificarFoto(ruim, 600_000).ok).toBe(false)
    }
    expect(decodificarFoto(b64(WEBP), 600_000).ok).toBe(true)
  })

  test('teto de tamanho por versão', () => {
    const grande = b64(`RIFF\0\0\0\0WEBP${'a'.repeat(500)}`)
    expect(decodificarFoto(grande, 100).ok).toBe(false)
  })

  test('lote: valida tudo antes de devolver; limite por envio; urlSm opcional', () => {
    const f = { url: b64(WEBP), urlSm: null, alt: '  ' }
    expect(prepararFotos([f])).toMatchObject({ ok: true, fotos: [{ alt: null, sm: null }] })
    expect(prepararFotos(Array(FOTOS_POR_ENVIO_MAX + 1).fill(f)).ok).toBe(false)
    expect(prepararFotos([f, { url: b64(WEBP), urlSm: 'x' }]).ok).toBe(false)
    expect(prepararFotos([]).ok).toBe(false)
    expect(prepararFotos('x').ok).toBe(false)
  })

  test('caminho do Storage é do servidor: <slug do tenant>/…, nunca algo do corpo', async () => {
    const caminhos: string[] = []
    const db = {
      storage: {
        from: () => ({
          upload: async (c: string, _b: unknown, o: { contentType: string }) => (caminhos.push(`${c}|${o.contentType}`), { error: null }),
          getPublicUrl: (c: string) => ({ data: { publicUrl: `https://cdn/${c}` } }),
        }),
      },
    }
    const r = prepararFotos([{ url: b64(WEBP), urlSm: b64(JPEG, 'jpeg'), alt: '../../etc/passwd' }])
    if (!r.ok) throw new Error('lote deveria ser válido')
    const out = await armazenarFotoImovel(db as never, 'acme', r.fotos[0]!)
    expect(caminhos).toHaveLength(2)
    expect(caminhos[0]).toMatch(/^acme\/\d+-[a-z0-9]+\.webp\|image\/webp$/)
    expect(caminhos[1]).toMatch(/^acme\/\d+-[a-z0-9]+@sm\.jpg\|image\/jpeg$/)
    expect(out.url.startsWith('https://cdn/acme/')).toBe(true)
  })
})

describe('mapper Property → ImovelGestao', () => {
  const p: Property = {
    id: 'p1', tenantId: 't1', code: 'NC-1', title: 'Casa', type: 'casa', purpose: 'venda', price: 1, neighborhood: 'Centro', city: 'TL', state: 'MS',
    bedrooms: 1, suites: 0, bathrooms: 1, parking: 0, area: 10, highStandard: false, description: null, features: [], status: 'active', featured: false,
    images: [{ id: 'i1', url: 'u', urlSm: null, alt: null, position: 0, isCover: true }], createdAt: 'c', updatedAt: 'u',
    updatedBy: 'func-uuid', brokerId: null, broker: { id: 'b', tenantId: 't1', name: 'N', phone: '5567', email: 'e@x', creci: null, active: true, photoUrl: null, bio: null, publicVisible: false, receivesLeads: true, lastLeadAt: null },
    capturedBy: null, ownerName: null, ownerPhone: '5567999',
  }

  test('não vaza updatedBy, broker (telefone/e-mail), tenantId; nulos viram vazio', () => {
    const i = toImovelGestao(p)
    const json = JSON.stringify(i)
    for (const segredo of ['func-uuid', '5567"', 'e@x', 't1']) expect(json).not.toContain(segredo)
    expect(i.brokerId).toBe('')
    expect(i.ownerName).toBe('')
    expect(i.ownerPhone).toBe('5567999') // proprietário é dado interno do gestão (não é rota pública)
    expect(i.code).toBe('NC-1')
  })

  test('corpo malformado nunca lança; tenantId/code/images do corpo não são lidos', () => {
    expect(lerCorpoImovel(null).ok).toBe(false)
    expect(lerCorpoImovel([]).ok).toBe(false)
    expect(lerCorpoImovel({ status: 'xx' }).ok).toBe(false)
    const r = lerCorpoImovel({ title: 5, price: '10', tenantId: 'x', code: 'HACK', images: [{ url: 'x' }], expectedUpdatedAt: 7 })
    if (!r.ok) throw new Error('deveria ler')
    expect(r.dados.title).toBe('')
    expect(r.dados.price).toBeNull()
    expect(r.expectedUpdatedAt).toBeNull()
    expect(JSON.stringify(r.dados)).not.toMatch(/tenantId|HACK|images/)
  })

  test('toPropertyInput: o código é o do servidor', () => {
    const lido = lerCorpoImovel({ title: 'a', type: 'casa', purpose: 'venda' })
    if (!lido.ok) throw new Error()
    expect(toPropertyInput({ ...lido.dados, type: 'casa', purpose: 'venda', description: null, addressZip: null, addressStreet: null, addressNumber: null, location: null, ownerPhone: null, price: 1, area: 1, neighborhood: 'n', city: 'c', state: 'MS' } as never, 'IM-0009').code).toBe('IM-0009')
  })
})

describe('property.repository — o que a F5 acrescentou', () => {
  const input = { code: 'X-1', title: 'T', type: 'casa' as const, purpose: 'venda' as const, price: 1 }
  const props = { data: [{ id: 'p1' }], error: null }

  test('updatePropertySemImagens não apaga nem regrava fotos; updateProperty (admin) continua trocando', async () => {
    const a = fakeSupabase({ properties: [props, { data: null, error: null }] })
    await updatePropertySemImagens(a.client, 't1', 'p1', input)
    expect(touched(a.calls, 'property_images')).toBe(false)
    expect(hadEq(a.calls, 'properties', 'tenant_id')).toBe(true)
    const { updateProperty } = await import('~~/server/repositories/property.repository')
    const b = fakeSupabase({ properties: [props, { data: null, error: null }] })
    await updateProperty(b.client, 't1', 'p1', input)
    expect(b.calls.some((c) => c.table === 'property_images' && c.method === 'delete')).toBe(true)
  })

  test('listAllProperties sem opts mantém o comportamento do /admin (sem filtro de corretor nem limite)', async () => {
    const { client, calls } = fakeSupabase({ properties: { data: [], error: null } })
    await listAllProperties(client, 't1')
    expect(calls.some((c) => c.method === 'limit' || (c.method === 'eq' && c.args[0] === 'broker_id'))).toBe(false)
    expect(calls.find((c) => c.method === 'order')?.args[0]).toBe('created_at')
  })

  test('foto de imóvel que NÃO é do tenant → 404 e nenhuma escrita em property_images', async () => {
    for (const op of [
      (c: never) => insertPropertyImages(c, 't1', 'de-outro', [{ url: 'u', urlSm: null, alt: null, position: 0, isCover: true }]),
      (c: never) => updatePropertyImageOrder(c, 't1', 'de-outro', [{ id: 'i', position: 0, isCover: true }]),
      (c: never) => deletePropertyImage(c, 't1', 'de-outro', 'i'),
    ]) {
      const { client, calls } = fakeSupabase({ properties: { data: null, error: null } })
      await expect(op(client as never)).rejects.toMatchObject({ statusCode: 404 })
      expect(touched(calls, 'property_images')).toBe(false)
      expect(calls.find((c) => c.method === 'eq' && c.args[0] === 'tenant_id')?.args[1]).toBe('t1')
    }
  })
})

describe('guardrail estático dos arquivos do gestão-imóveis', () => {
  const raiz = process.cwd()
  const listar = (dir: string): string[] =>
    readdirSync(join(raiz, dir)).flatMap((n) => {
      const rel = join(dir, n)
      return statSync(join(raiz, rel)).isDirectory() ? listar(rel) : [rel]
    })
  const endpoints = listar('server/api/gestao/imoveis').concat(['server/api/gestao/imoveis.get.ts', 'server/api/gestao/imoveis.post.ts'])
  const nucleo = ['server/utils/gestao-imoveis.ts', 'server/utils/gestao-fotos.ts', 'server/mappers/gestao-imovel.ts']
  const ler = (f: string) => stripComments(readFileSync(join(raiz, f), 'utf8'))

  test('todo endpoint passa pelo contexto autenticado e nenhum lê tenant do corpo', () => {
    for (const f of endpoints) {
      const src = ler(f)
      expect(src, f).toContain('contextoImoveis(event)')
      expect(src, f).not.toMatch(/tenant/i)
      expect(src, f).not.toContain('serviceSupabase')
    }
  })

  test('núcleo e mapper não usam select(*) nem leem tenant do corpo', () => {
    for (const f of nucleo) {
      const src = ler(f)
      expect(src, f).not.toMatch(/\.select\(\s*['"`]\s*\*/)
      expect(src, f).not.toMatch(/corpo[^\n]*tenant|body[^\n]*tenant/i)
    }
  })

  test('toda chamada de repositório do núcleo recebe o tenant do contexto', () => {
    const src = ler('server/utils/gestao-imoveis.ts')
    const chamadas = src.match(/\b(?:getPropertyById|listAllProperties|listPropertyIdentities|createProperty|updatePropertySemImagens|updatePropertyStatus|updatePropertyFeatured|deleteProperty|insertPropertyImages|updatePropertyImageOrder|deletePropertyImage|getBroker)\(ctx\.db, [^,)]+/g) ?? []
    expect(chamadas.length).toBeGreaterThan(10)
    for (const c of chamadas) expect(c, c).toMatch(/ctx\.db, ctx\.tenant\.id$/)
  })
})
