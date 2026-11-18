import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { quandoBrasil, toConsultaModel } from '~~/server/mappers/gestao-consulta'

describe('consulta: mapper e migration 0063', () => {
  test('a row vira o modelo do domínio, sem o uuid do autor, e a hora sai no fuso do painel', () => {
    const m = toConsultaModel({
      id: 'C-0001', documento_mascarado: '529.***.***-25', tipo: 'cpf', finalidade: 'Venda', contrato_id: null,
      ator_nome: 'Ana', ator_user_id: 'segredo', situacao: 'sem-restricoes', score: 700, restricoes: [], quando: '2026-11-17T01:30:00Z',
    })
    expect(m).toMatchObject({ quem: 'Ana', quando: '16/11/2026 21:30', simulada: true })
    expect(JSON.stringify(m)).not.toContain('segredo')
    expect(quandoBrasil('2026-01-01T03:00:00Z')).toBe('31/12/2025 23:00')
  })

  test('a tabela não tem coluna para o documento inteiro e o check exige a máscara', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/0063_gestao_consultas.sql'), 'utf8').replace(/--.*$/gm, '')
    expect(sql).not.toMatch(/\b(documento|cpf|cnpj)\s+text\b/i)
    expect(sql).toMatch(/documento_mascarado text not null\s+check/)
    expect(sql).toMatch(/revoke all on public\.gestao_consultas from anon, authenticated/)
  })
})
