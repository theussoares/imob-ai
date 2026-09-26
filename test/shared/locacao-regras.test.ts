import { describe, expect, test } from 'vitest'
import { contratoQueOcupa } from '~~/shared/models/lease'
import { competenciaForaDaVigencia, proximaCompetenciaLivre } from '~~/shared/models/cobranca'
import { chavePixValida } from '~~/shared/utils/pix'
import { formatoPelaAssinatura } from '~~/shared/utils/arquivo-documento'

const c = (over: Partial<Parameters<typeof contratoQueOcupa>[0][number]> = {}) => ({
  id: 'c1',
  code: 'LOC-2026-001',
  propertyId: 'imovel',
  status: 'ativo' as const,
  startedOn: '2026-01-01',
  endsOn: '2028-06-30',
  ...over,
})

describe('contratoQueOcupa', () => {
  test('período que cruza o de um contrato ativo do mesmo imóvel', () => {
    expect(contratoQueOcupa([c()], { propertyId: 'imovel', startedOn: '2026-10-01', endsOn: '2029-03-31' })?.code).toBe('LOC-2026-001')
  })

  test('começar no dia seguinte ao fim do anterior é livre', () => {
    expect(contratoQueOcupa([c()], { propertyId: 'imovel', startedOn: '2028-07-01', endsOn: null })).toBeNull()
  })

  test('contrato sem fim ocupa o imóvel dali em diante', () => {
    expect(contratoQueOcupa([c({ endsOn: null })], { propertyId: 'imovel', startedOn: '2035-01-01', endsOn: null })).not.toBeNull()
  })

  test('encerrado, outro imóvel, o próprio contrato e contrato sem imóvel não contam', () => {
    const alvo = { propertyId: 'imovel', startedOn: '2026-10-01', endsOn: null }
    expect(contratoQueOcupa([c({ status: 'encerrado' })], alvo)).toBeNull()
    expect(contratoQueOcupa([c({ propertyId: 'outro' })], alvo)).toBeNull()
    expect(contratoQueOcupa([c()], { ...alvo, excetoId: 'c1' })).toBeNull()
    expect(contratoQueOcupa([c()], { ...alvo, propertyId: null })).toBeNull()
  })
})

describe('competência da cobrança', () => {
  const vig = { startedOn: '2026-10-01', endsOn: '2029-03-31' }

  test('setembro num contrato que começa em outubro está fora — era a sugestão da tela', () => {
    expect(competenciaForaDaVigencia('2026-09', vig)).toBe('antes')
    expect(competenciaForaDaVigencia('2026-10', vig)).toBeNull()
    expect(competenciaForaDaVigencia('2029-03', vig)).toBeNull()
    expect(competenciaForaDaVigencia('2029-04', vig)).toBe('depois')
  })

  test('mês parcial de entrada conta como dentro', () => {
    expect(competenciaForaDaVigencia('2026-10', { startedOn: '2026-10-15', endsOn: null })).toBeNull()
  })

  test('a sugestão parte do início do contrato quando ele é futuro', () => {
    expect(proximaCompetenciaLivre(new Set(), vig, '2026-09-26')).toBe('2026-10')
  })

  test('contrato em curso: parte do mês corrente e pula os já cobrados', () => {
    expect(proximaCompetenciaLivre(new Set(['2026-09']), { startedOn: '2026-01-01', endsOn: null }, '2026-09-26')).toBe('2026-10')
  })

  test('vigência encerrada não sugere mês nenhum', () => {
    expect(proximaCompetenciaLivre(new Set(), { startedOn: '2025-01-01', endsOn: '2025-12-31' }, '2026-09-26')).toBeNull()
  })
})

describe('chavePixValida', () => {
  test('cada tipo tem o seu formato', () => {
    expect(chavePixValida('cpf', '123')).toBe(false)
    expect(chavePixValida('cpf', '529.982.247-25')).toBe(true)
    expect(chavePixValida('cnpj', '529.982.247-25')).toBe(false)
    expect(chavePixValida('cnpj', '11.222.333/0001-81')).toBe(true)
    expect(chavePixValida('email', 'dono@exemplo.com')).toBe(true)
    expect(chavePixValida('email', 'dono')).toBe(false)
    expect(chavePixValida('telefone', '+55 (67) 99123-4567')).toBe(true)
    expect(chavePixValida('telefone', '(67) 99123-4567')).toBe(true)
    expect(chavePixValida('telefone', '99123-4567')).toBe(false)
    expect(chavePixValida('aleatoria', '123e4567-e89b-12d3-a456-426614174000')).toBe(true)
    expect(chavePixValida('aleatoria', 'qualquer-coisa')).toBe(false)
  })
})

describe('formatoPelaAssinatura', () => {
  const bytes = (...b: number[]) => new Uint8Array([...b, ...Array(16).fill(0)])

  test('reconhece PDF, JPEG, PNG e WEBP pelo conteúdo', () => {
    expect(formatoPelaAssinatura(new TextEncoder().encode('%PDF-1.7\n'))).toBe('application/pdf')
    expect(formatoPelaAssinatura(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg')
    expect(formatoPelaAssinatura(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe('image/png')
    expect(formatoPelaAssinatura(new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 '))).toBe('image/webp')
  })

  test('executável é recusado mesmo com nome .pdf — foi publicado para clientes', () => {
    // "MZ" é o começo de todo .exe do Windows; o nome do arquivo não muda isso.
    expect(formatoPelaAssinatura(bytes(0x4d, 0x5a, 0x90, 0x00))).toBeNull()
    expect(formatoPelaAssinatura(new TextEncoder().encode('<html><script>'))).toBeNull()
  })
})
