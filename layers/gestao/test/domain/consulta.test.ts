import { describe, expect, it } from 'vitest'
import { mascararDocumento, proximoIdConsulta, realizarConsulta, simularConsulta } from '../../domain/consulta'

const CPF = '529.982.247-25'
const CNPJ = '11.222.333/0001-81'
const ator = { nome: 'Marina Alves' }
const Q = '17/11/2026 10:00'

describe('mascararDocumento', () => {
  it('esconde o miolo do CPF e do CNPJ', () => {
    expect(mascararDocumento(CPF)).toBe('529.***.***-25')
    expect(mascararDocumento(CNPJ)).toBe('11.***.***/0001-81')
    expect(mascararDocumento('123')).toBe('***')
  })
})

describe('simularConsulta', () => {
  it('é determinística: o mesmo documento dá sempre o mesmo resultado, com ou sem máscara', () => {
    expect(simularConsulta(CPF)).toEqual(simularConsulta('52998224725'))
  })

  it('score dentro de 0..1000 e restrição coerente com a situação, em muitos documentos', () => {
    let com = 0
    for (let i = 0; i < 300; i++) {
      const r = simularConsulta(String(10_000_000_000 + i * 7919))
      expect(r.score).toBeGreaterThanOrEqual(0)
      expect(r.score).toBeLessThanOrEqual(1000)
      expect(r.restricoes.length > 0).toBe(r.situacao === 'com-restricoes')
      if (r.situacao === 'com-restricoes') com++
    }
    // A demo precisa mostrar os dois casos sem ninguém procurar o CPF certo.
    expect(com).toBeGreaterThan(30)
    expect(com).toBeLessThan(150)
  })
})

describe('realizarConsulta', () => {
  it('recusa documento inválido e consulta sem finalidade', () => {
    expect(realizarConsulta({ documento: '111.111.111-11', finalidade: 'Locação' }, ator, Q, 'C-0001')).toEqual({ ok: false, erro: 'Informe um CPF ou CNPJ válido.' })
    expect(realizarConsulta({ documento: '123', finalidade: 'Locação' }, ator, Q, 'C-0001')).toMatchObject({ ok: false })
    expect(realizarConsulta({ documento: CPF, finalidade: '' }, ator, Q, 'C-0001')).toEqual({ ok: false, erro: 'Informe a finalidade da consulta.' })
  })

  it('registra quem, quando e a finalidade, marca como simulada e NUNCA guarda o documento inteiro', () => {
    const r = realizarConsulta({ documento: CPF, finalidade: 'Locação', contratoId: 'L-2026-0004' }, ator, Q, 'C-0001')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.consulta).toMatchObject({ id: 'C-0001', tipo: 'cpf', quem: 'Marina Alves', quando: Q, finalidade: 'Locação', contratoId: 'L-2026-0004', simulada: true })
    expect(JSON.stringify(r.consulta)).not.toContain('52998224725')
    expect(JSON.stringify(r.consulta)).not.toContain('529.982.247')
  })

  it('aceita CNPJ e contrato em branco', () => {
    const r = realizarConsulta({ documento: CNPJ, finalidade: 'Venda', contratoId: '' }, ator, Q, 'C-0002')
    expect(r.ok && r.consulta.tipo).toBe('cnpj')
    expect(r.ok && r.consulta.contratoId).toBeNull()
  })
})

describe('proximoIdConsulta', () => {
  it('fica sempre acima do maior existente', () => {
    expect(proximoIdConsulta([])).toBe('C-0001')
    const a = realizarConsulta({ documento: CPF, finalidade: 'Venda' }, ator, Q, 'C-0007')
    expect(a.ok && proximoIdConsulta([a.consulta])).toBe('C-0008')
  })
})
