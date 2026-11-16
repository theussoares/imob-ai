import { describe, expect, it } from 'vitest'
import { filtrarLocacoes } from '../../domain/filtro-locacao'
import { locacoesSeed } from '../../domain/locacao-seed'
import { CORRETORES } from '../../domain/seed'

const todas = locacoesSeed()
const ids = (q: string, status: '' | 'Ativa' = '') => filtrarLocacoes(todas, { q, status }, CORRETORES).map((l) => l.id)

describe('filtro de locações', () => {
  it('sem filtro devolve todas', () => expect(ids('')).toHaveLength(todas.length))
  it('busca sem acento e sem caixa, por locatário, imóvel e corretor', () => {
    expect(ids('FERNANDA')).toEqual(['L-2026-0001'])
    expect(ids('kitnet')).toEqual(['L-2026-0004'])
    expect(ids('juliana')).toEqual(['L-2026-0003'])
  })
  it('todos os termos são exigidos e o status filtra', () => {
    expect(ids('eduardo fernanda')).toEqual(['L-2026-0001'])
    expect(ids('eduardo kitnet')).toEqual([])
    expect(ids('', 'Ativa')).toEqual(['L-2026-0001'])
  })
  it('CPF casa pelos dígitos', () => expect(ids('51366077088')).toEqual(['L-2026-0001']))
})
