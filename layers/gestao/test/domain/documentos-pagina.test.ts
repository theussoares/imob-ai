import { describe, expect, it } from 'vitest'
import { filtroDocumentosDaUrl, paginarDocumentos, queryDosDocumentos } from '../../domain/documentos'
import { documentosSeedCompleto, processosSeed } from '../../domain/seed'
import type { Documento } from '../../domain/types'

describe('filtro de Documentos na URL', () => {
  const pode = { podeApagar: true }

  it('padrão e ida e volta', () => {
    expect(filtroDocumentosDaUrl({}, pode)).toEqual({ pagina: 1, q: '', aba: 'documentos', categoria: 'todas', processo: '', de: '' })
    expect(queryDosDocumentos(filtroDocumentosDaUrl({}, pode))).toEqual({})
    const f = { pagina: 3, q: 'rg', aba: 'lixeira' as const, categoria: 'pessoas' as const, processo: 'V-2026-0142', de: 'processo' as const }
    expect(filtroDocumentosDaUrl(queryDosDocumentos(f), pode)).toEqual(f)
  })

  it('valores inválidos viram o padrão; `de` sem processo some; lixeira some de quem não apaga', () => {
    expect(filtroDocumentosDaUrl({ aba: 'x', categoria: 'y', processo: 'abc', de: 'processo', pagina: '0' }, pode)).toEqual({ pagina: 1, q: '', aba: 'documentos', categoria: 'todas', processo: '', de: '' })
    expect(filtroDocumentosDaUrl({ aba: 'lixeira' }, { podeApagar: false }).aba).toBe('documentos')
  })
})

describe('locação na lista de documentos', () => {
  const processos = processosSeed().filter((p) => !p.arquivado)
  const locacoes = [{ id: 'L-2026-0001', imovel: 'Casa da praia' }]
  const d = (id: string, processoId: string, over: Partial<Documento> = {}): Documento => ({
    id, nome: `${id}.pdf`, categoria: 'locacao', processoId, estado: 'enviado', tamanho: 1, versoes: 1, enviadoPor: 'Ana', apagado: null, ...over,
  })
  const f = { aba: 'documentos' as const, categoria: 'todas' as const, q: '', processo: '', pagina: 1 }

  it('documento de locação aparece e conta nas abas; sem a locação visível, some', () => {
    const docs = [d('a', 'L-2026-0001'), d('b', 'L-2026-0001', { apagado: { quem: 'Ana', quando: 'x' } }), d('c', 'L-2026-0099')]
    const r = paginarDocumentos(docs, processos, f, { podeApagar: true }, locacoes)
    expect(r.itens.map((x) => x.id)).toEqual(['a'])
    expect(r.abas).toMatchObject({ documentos: 1, lixeira: 1 })
    expect(r.imoveis).toEqual({ 'L-2026-0001': 'Casa da praia' })
    expect(paginarDocumentos(docs, processos, f, { podeApagar: true }).itens).toEqual([])
  })

  it('a busca acha pelo imóvel da locação; «sem PDF» não inclui locação', () => {
    const docs = [d('a', 'L-2026-0001')]
    expect(paginarDocumentos(docs, processos, { ...f, q: 'praia' }, { podeApagar: true }, locacoes).itens).toHaveLength(1)
    expect(paginarDocumentos(docs, processos, { ...f, aba: 'sem-pdf' }, { podeApagar: true }, locacoes).contratos.every((c) => c.id.startsWith('V-'))).toBe(true)
  })

  it('URL aceita ?processo=L-…', () => {
    expect(filtroDocumentosDaUrl({ processo: 'L-2026-0001', de: 'processo' }, { podeApagar: true })).toMatchObject({ processo: 'L-2026-0001', de: 'processo' })
  })
})

describe('paginarDocumentos (a conta do servidor e do mock)', () => {
  const processos = processosSeed().filter((p) => !p.arquivado)
  const alvo = processos[0]!
  const doc = (i: number, over: Partial<Documento> = {}): Documento => ({
    id: `d${i}`, nome: `Arquivo ${i}.pdf`, categoria: 'pessoas', processoId: alvo.id, estado: 'enviado', tamanho: 1, versoes: 1, enviadoPor: 'Ana', apagado: null, ...over,
  })

  it('fatia em 24, conta o total do filtro e traz o imóvel dos processos da página', () => {
    const docs = Array.from({ length: 30 }, (_, i) => doc(i))
    const p2 = paginarDocumentos(docs, processos, { aba: 'documentos', categoria: 'todas', q: '', processo: '', pagina: 2 }, { podeApagar: true })
    expect(p2.itens).toHaveLength(6)
    expect(p2).toMatchObject({ total: 30, paginas: 2, abas: { documentos: 30, lixeira: 0 } })
    expect(p2.imoveis).toEqual({ [alvo.id]: alvo.imovel })
  })

  it('sem permissão de apagar a contagem da lixeira não vaza', () => {
    const docs = [doc(1), doc(2, { apagado: { quem: 'Ana', quando: '01/11/2026 10:00' } })]
    const r = paginarDocumentos(docs, processos, { aba: 'documentos', categoria: 'todas', q: '', processo: '', pagina: 1 }, { podeApagar: false })
    expect(r.abas.lixeira).toBe(0)
  })

  it('aba sem-pdf lista contratos (id, imóvel, status), não documentos', () => {
    const r = paginarDocumentos(documentosSeedCompleto(), processos, { aba: 'sem-pdf', categoria: 'todas', q: '', processo: '', pagina: 1 }, { podeApagar: true })
    expect(r.itens).toEqual([])
    expect(r.contratos.every((c) => c.id && c.imovel && c.status)).toBe(true)
    expect(r.total).toBe(r.abas['sem-pdf'])
  })
})
