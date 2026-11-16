import { describe, expect, it } from 'vitest'
import { ETAPAS_LOCACAO, locacaoFinal, statusPorEtapa, TOTAL_ETAPAS_LOCACAO } from '../../domain/locacao-status'

const feitas = (n: number) => Array.from({ length: 8 }, (_, i) => i < n)

describe('status e etapas da locação', () => {
  it('tem 8 etapas e nenhuma abrevia «Documentos»', () => {
    expect(ETAPAS_LOCACAO).toHaveLength(8)
    expect(TOTAL_ETAPAS_LOCACAO).toBe(8)
    expect(ETAPAS_LOCACAO.filter((e) => /\bDocs?\b/.test(e))).toEqual([])
  })

  it('deriva o status da etapa em andamento', () => {
    expect(statusPorEtapa(1, feitas(0))).toBe('Em abertura')
    expect(statusPorEtapa(2, feitas(1))).toBe('Aguardando documentação')
    expect(statusPorEtapa(3, feitas(2))).toBe('Aguardando documentação')
    expect(statusPorEtapa(4, feitas(3))).toBe('Aguardando documentação')
    expect(statusPorEtapa(5, feitas(4))).toBe('Aguardando garantia')
    expect(statusPorEtapa(6, feitas(5))).toBe('Aguardando vistoria de entrada')
    expect(statusPorEtapa(7, feitas(6))).toBe('Contrato e aluguel')
    expect(statusPorEtapa(8, feitas(7))).toBe('Ativa')
  })

  it('só «Encerrada» é final', () => {
    expect(locacaoFinal('Encerrada')).toBe(true)
    expect(locacaoFinal('Ativa')).toBe(false)
  })
})
