import { describe, expect, it } from 'vitest'
import {
  contarAbas,
  contratosSemPdf,
  extensao,
  filtrarDocumentos,
  formatarTamanho,
  listaVersoes,
  tipoArquivo,
  validarArquivo,
} from '../../domain/documentos'
import { matrizPadrao, processosVisiveis, sessaoDoPerfil } from '../../domain/permissions'
import { documentosSeed, processosSeed } from '../../domain/seed'

const matriz = matrizPadrao()
const todos = processosSeed()
const docs = documentosSeed()
const dono = processosVisiveis(matriz, sessaoDoPerfil('dono'), todos)
const corretor = processosVisiveis(matriz, sessaoDoPerfil('corretor'), todos) // Carlos = c1

const ids = (l: { id: string }[]) => l.map((x) => x.id)

describe('filtrarDocumentos', () => {
  it('aba documentos exclui a lixeira; aba lixeira só tem apagados', () => {
    expect(ids(filtrarDocumentos(docs, dono, 'documentos'))).not.toContain('d8')
    expect(ids(filtrarDocumentos(docs, dono, 'lixeira'))).toEqual(['d8'])
  })

  it('filtra por categoria', () => {
    expect(ids(filtrarDocumentos(docs, dono, 'documentos', { categoria: 'venda' }))).toEqual(['d3', 'd4'])
    expect(filtrarDocumentos(docs, dono, 'documentos', { categoria: 'vistoria' })).toEqual([])
    expect(filtrarDocumentos(docs, dono, 'documentos', { categoria: 'todas' })).toHaveLength(7)
  })

  it('busca por nome, processo e imóvel, ignorando acento e caixa', () => {
    expect(ids(filtrarDocumentos(docs, dono, 'documentos', { busca: 'MATRICULA' }))).toEqual(['d2'])
    expect(ids(filtrarDocumentos(docs, dono, 'documentos', { busca: 'v-2026-0158' }))).toEqual(['d7'])
    const imovel = dono.find((p) => p.id === 'V-2026-0151')!.imovel
    expect(ids(filtrarDocumentos(docs, dono, 'documentos', { busca: imovel.split('·')[1]!.trim() }))).toEqual(['d5', 'd6'])
  })

  it('restringe a um processo', () => {
    expect(ids(filtrarDocumentos(docs, dono, 'documentos', { processoId: 'V-2026-0151' }))).toEqual(['d5', 'd6'])
  })

  it('combina filtros', () => {
    expect(
      ids(filtrarDocumentos(docs, dono, 'documentos', { processoId: 'V-2026-0142', categoria: 'venda', busca: 'aditivo' })),
    ).toEqual(['d4'])
  })

  it('aba sem-pdf não devolve documentos', () => {
    expect(filtrarDocumentos(docs, dono, 'sem-pdf')).toEqual([])
  })
})

describe('visibilidade por processo', () => {
  it('corretor só vê documento de processo próprio', () => {
    const vistos = filtrarDocumentos(docs, corretor, 'documentos')
    expect(vistos.length).toBeGreaterThan(0)
    const meus = new Set(corretor.map((p) => p.id))
    expect(vistos.every((d) => meus.has(d.processoId))).toBe(true)
    expect(ids(vistos)).not.toContain('d5') // processo da Juliana
  })

  it('lixeira também respeita a visibilidade', () => {
    // d8 é do V-2026-0142 (Carlos); some para quem não enxerga o processo.
    const dosOutros = processosVisiveis(matriz, { perfil: 'corretor', nome: 'X', corretorId: 'c2' }, todos)
    expect(filtrarDocumentos(docs, corretor, 'lixeira')).toHaveLength(1)
    expect(filtrarDocumentos(docs, dosOutros, 'lixeira')).toEqual([])
  })

  it('processo fora da lista de visíveis esconde mesmo com ?processo=', () => {
    expect(filtrarDocumentos(docs, corretor, 'documentos', { processoId: 'V-2026-0151' })).toEqual([])
  })
})

describe('contagens das abas', () => {
  it('contam por visibilidade e processo, sem olhar busca/categoria', () => {
    expect(contarAbas(docs, dono)).toEqual({ documentos: 7, lixeira: 1, 'sem-pdf': 3 })
    expect(contarAbas(docs, dono, 'V-2026-0142')).toEqual({ documentos: 4, lixeira: 1, 'sem-pdf': 0 })
    expect(contarAbas(docs, corretor).lixeira).toBe(1)
  })
})

describe('contratosSemPdf', () => {
  it('lista processos sem PDF e exclui cancelada', () => {
    const lista = contratosSemPdf(todos)
    expect(lista.every((p) => !p.pdf && p.status !== 'Venda cancelada')).toBe(true)
    expect(ids(lista)).not.toContain('V-2026-0147')
    expect(ids(lista)).not.toContain('V-2026-0142') // tem PDF
  })

  it('respeita processo e busca', () => {
    expect(ids(contratosSemPdf(dono, { processoId: 'V-2026-0151' }))).toEqual(['V-2026-0151'])
    expect(contratosSemPdf(dono, { processoId: 'V-2026-0142' })).toEqual([])
    expect(ids(contratosSemPdf(dono, { busca: '0155' }))).toEqual(['V-2026-0155'])
  })
})

describe('formatarTamanho', () => {
  it('usa unidade legível com vírgula decimal', () => {
    expect(formatarTamanho(2_400_000)).toBe('2,4 MB')
    expect(formatarTamanho(812_000)).toBe('812 KB')
    expect(formatarTamanho(300)).toBe('300 B')
    expect(formatarTamanho(0)).toBe('0 B')
    expect(formatarTamanho(-5)).toBe('0 B')
    expect(formatarTamanho(1_500_000_000)).toBe('1,5 GB')
  })
})

describe('arquivo', () => {
  it('extensão e tipo', () => {
    expect(extensao('Foto da fachada.JPG')).toBe('jpg')
    expect(extensao('sem-extensao')).toBe('')
    expect(tipoArquivo('a.pdf')).toBe('pdf')
    expect(tipoArquivo('a.webp')).toBe('imagem')
    expect(tipoArquivo('a.docx')).toBe('outro')
  })

  it('listaVersoes marca a atual e numera de M a 1', () => {
    expect(listaVersoes({ versoes: 3 })).toEqual([
      { numero: 3, total: 3, atual: true },
      { numero: 2, total: 3, atual: false },
      { numero: 1, total: 3, atual: false },
    ])
    expect(listaVersoes({ versoes: 1 })).toHaveLength(1)
  })
})

describe('validarArquivo', () => {
  it('aceita PDF/JPG/PNG/WEBP até 15 MB e recusa o resto', () => {
    expect(validarArquivo('a.PDF', 1000)).toBeNull()
    expect(validarArquivo('a.jpeg', 15 * 1024 * 1024)).toBeNull()
    expect(validarArquivo('a.exe', 10)).toMatch(/PDF, JPG/)
    expect(validarArquivo('a.pdf', 15 * 1024 * 1024 + 1)).toMatch(/15 MB/)
  })
})
