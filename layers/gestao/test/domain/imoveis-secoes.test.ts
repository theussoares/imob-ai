import { describe, expect, it } from 'vitest'
import { formImovelVazio } from '../../domain/imoveis-acoes'
import { errosImovel } from '../../domain/imoveis-acoes'
import { errosPorSecao, resumoSecao, rotuloErrosSecao, SECAO_DO_CAMPO, secoesAbertasPadrao } from '../../domain/imoveis-secoes'

describe('secoes do imóvel', () => {
  it('todo campo validado pertence a um bloco: formulário vazio acusa erro em anúncio, endereço, medidas e interno', () => {
    const por = errosPorSecao(errosImovel(formImovelVazio('')))
    expect(por.anuncio).toBeGreaterThan(0)
    expect(por.endereco).toBeGreaterThan(0)
    expect(por.medidas).toBeGreaterThan(0)
    expect(por.interno).toBeGreaterThan(0)
    expect(por.fotos).toBe(0)
    expect(new Set(Object.values(SECAO_DO_CAMPO))).not.toContain('fotos')
  })

  it('só o anúncio começa aberto; somente leitura abre tudo', () => {
    expect(Object.entries(secoesAbertasPadrao()).filter(([, v]) => v).map(([k]) => k)).toEqual(['anuncio'])
    expect(Object.values(secoesAbertasPadrao(true)).every(Boolean)).toBe(true)
  })

  it('resumo dos blocos fechados ignora o que está vazio', () => {
    const m = { ...formImovelVazio('c1'), neighborhood: 'Centro', city: 'Três Lagoas', state: 'ms', area: 98, bedrooms: 3, parking: 1, ownerName: ' Maria ' }
    expect(resumoSecao('endereco', m)).toBe('Centro · Três Lagoas/MS')
    expect(resumoSecao('medidas', m)).toBe('98 m² · 3 quartos · 1 vaga')
    expect(resumoSecao('interno', m)).toBe('Maria')
    expect(resumoSecao('medidas', formImovelVazio(''))).toBe('')
  })

  it('rótulo do selo concorda no singular', () => {
    expect(rotuloErrosSecao(1)).toBe('1 campo a corrigir')
    expect(rotuloErrosSecao(3)).toBe('3 campos a corrigir')
  })
})
