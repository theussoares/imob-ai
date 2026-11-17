import { describe, expect, it } from 'vitest'
import { eventosAuditoria, FILTRO_AUDITORIA_VAZIO, filtrarAuditoria, pessoasDaAuditoria } from '../../domain/auditoria'
import { locacoesSeed } from '../../domain/locacao-seed'
import { processosSeed } from '../../domain/seed'

const todos = () => eventosAuditoria(processosSeed(), locacoesSeed('2026-11-17'))
const f = (p: Partial<typeof FILTRO_AUDITORIA_VAZIO>) => ({ ...FILTRO_AUDITORIA_VAZIO, ...p })

describe('eventosAuditoria', () => {
  it('reúne o histórico de vendas e locações, do mais recente ao mais antigo', () => {
    const e = todos()
    const total = processosSeed().reduce((n, p) => n + p.hist.length, 0) + locacoesSeed().reduce((n, l) => n + l.hist.length, 0)
    expect(e).toHaveLength(total)
    expect(e.some((x) => x.tipo === 'venda')).toBe(true)
    expect(e.some((x) => x.tipo === 'locacao')).toBe(true)
    const chaves = e.map((x) => x.chave)
    expect(chaves).toEqual([...chaves].sort().reverse())
  })

  it('inclui o histórico de contrato arquivado (auditoria não esconde o arquivo)', () => {
    const l = locacoesSeed('2026-11-17').map((x) => ({ ...x, arquivado: true }))
    const e = eventosAuditoria([], l)
    expect(e.length).toBeGreaterThan(0)
    expect(e.every((x) => x.arquivado)).toBe(true)
  })

  it('no empate de horário o evento registrado por último vem primeiro', () => {
    const l = locacoesSeed('2026-11-17')[0]!
    const e = eventosAuditoria([], [{ ...l, hist: [{ acao: 'A', quem: 'x', quando: '10/11/2026 10:00' }, { acao: 'B', quem: 'x', quando: '10/11/2026 10:00' }] }])
    expect(e.map((x) => x.acao)).toEqual(['B', 'A'])
  })
})

describe('filtrarAuditoria', () => {
  it('filtra por pessoa, por tipo e por texto sem acento', () => {
    const e = todos()
    const quem = pessoasDaAuditoria(e)[0]!
    expect(filtrarAuditoria(e, f({ quem })).every((x) => x.quem === quem)).toBe(true)
    expect(filtrarAuditoria(e, f({ tipo: 'locacao' })).every((x) => x.tipo === 'locacao')).toBe(true)
    expect(filtrarAuditoria(e, f({ q: 'ENCERROU locacao' })).every((x) => /encerrou/i.test(x.acao))).toBe(true)
    expect(filtrarAuditoria(e, f({ q: 'zzz' }))).toEqual([])
  })

  it('o período é inclusivo nas duas pontas', () => {
    const e = todos()
    const dia = e.find((x) => x.chave)!.chave.slice(0, 10)
    const so = filtrarAuditoria(e, f({ de: dia, ate: dia }))
    expect(so.length).toBeGreaterThan(0)
    expect(so.every((x) => x.chave.startsWith(dia))).toBe(true)
    expect(filtrarAuditoria(e, f({ de: '2099-01-01' }))).toEqual([])
  })

  it('lista as pessoas sem repetir, em ordem alfabética', () => {
    const p = pessoasDaAuditoria(todos())
    expect(new Set(p).size).toBe(p.length)
    expect(p).toEqual([...p].sort((a, b) => a.localeCompare(b, 'pt-BR')))
  })
})
