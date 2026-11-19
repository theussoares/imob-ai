import { describe, expect, test } from 'vitest'
import { abrirLocacao } from '~~/layers/gestao/domain/acoes-locacao'
import type { Locacao } from '~~/layers/gestao/domain/types'
import { semValores, toLocacaoModel, toLocacaoRow } from '~~/server/mappers/gestao-locacao'

const CORRETOR = '11111111-1111-4111-8111-111111111111'
const IMOVEL = '22222222-2222-4222-8222-222222222222'

function locacaoAtiva(): Locacao {
  const r = abrirLocacao({ processos: [], documentos: [], locacoes: [] }, { locador: 'Ana', locatario: 'Bruno', imovelId: IMOVEL, imovel: 'Casa 1', corretorId: CORRETOR }, { nome: 'Carlos' }, '17/11/2026 10:00')
  if (!r.ok) throw new Error(r.erro)
  return {
    ...r.estado.locacoes[0]!,
    status: 'Ativa',
    etapa: 8,
    concluidas: Array(8).fill(true).map((_, i) => i < 7),
    contrato: { valor: 3200, diaVencimento: 10, inicio: '2026-01-01', fim: '2027-01-01', reajuste: 'IGP-M', taxaPct: 8 },
    cobrancas: [
      {
        id: 'cb-2026-10',
        competencia: '2026-10',
        valor: 3200,
        vencimento: '2026-10-10',
        pago: { data: '2026-10-09', comprovante: 'pix-outubro.pdf' },
        repasse: { valor: 2944, feito: false },
      },
    ],
  }
}

describe('mapper de locação do gestão', () => {
  test('ida e volta preserva o agregado e a versão', () => {
    const l = locacaoAtiva()
    const row = { ...toLocacaoRow(l, 't1'), versao: 4, updated_at: '2026-11-17T10:00:00Z' }
    const volta = toLocacaoModel(row)
    expect(volta.versao).toBe(4)
    expect(volta.locacao).toEqual(l)
  })

  test('o tenant vem do parâmetro, e só corretor/imóvel uuid viram coluna', () => {
    const row = toLocacaoRow({ ...locacaoAtiva(), corretorId: 'c1', imovelId: 'im1' }, 'tenant-x')
    expect(row.tenant_id).toBe('tenant-x')
    expect(row.corretor_id).toBeNull()
    expect(row.imovel_id).toBeNull()
    expect(toLocacaoRow(locacaoAtiva(), 't').corretor_id).toBe(CORRETOR)
  })

  test('as colunas mandam no que filtra: arquivado/status/etapa divergentes em dados perdem', () => {
    const l = locacaoAtiva()
    const row = { ...toLocacaoRow(l, 't1'), versao: 1, updated_at: 'x', arquivado: true, etapa: 3 }
    const m = toLocacaoModel(row).locacao
    expect(m.arquivado).toBe(true)
    expect(m.etapa).toBe(3)
  })

  test('jsonb fora da forma é recusado na leitura, em vez de chegar à tela', () => {
    const row = { ...toLocacaoRow(locacaoAtiva(), 't1'), versao: 1, updated_at: 'x', dados: { id: 'L-2026-0001' } }
    expect(() => toLocacaoModel(row)).toThrow()
  })

  test('na escrita, agregado inválido não vira linha', () => {
    expect(() => toLocacaoRow({ ...locacaoAtiva(), concluidas: [true] }, 't1')).toThrow()
  })
})

describe('recorte sem a permissão «valores»', () => {
  test('nada financeiro sobrevive: valor, taxa, repasse e comprovante somem', () => {
    const json = JSON.stringify(semValores(locacaoAtiva()))
    for (const proibido of ['3200', '2944', 'valor', 'taxaPct', 'repasse"', 'comprovante', 'pix-outubro']) {
      expect(json).not.toContain(proibido)
    }
  })

  test('mantém o que o aviso e a tela sem valores precisam', () => {
    const s = semValores(locacaoAtiva())
    expect(s.contrato).toEqual({ diaVencimento: 10, inicio: '2026-01-01', fim: '2027-01-01', reajuste: 'IGP-M' })
    expect(s.cobrancas[0]).toEqual({ id: 'cb-2026-10', competencia: '2026-10', vencimento: '2026-10-10', pago: { data: '2026-10-09' }, repasseFeito: false })
  })

  test('é allowlist: campo novo no contrato não vaza por esquecimento', () => {
    const l = locacaoAtiva()
    const comCampoNovo = { ...l, contrato: { ...l.contrato!, multaRescisoria: 999 } } as Locacao
    expect(JSON.stringify(semValores(comCampoNovo))).not.toContain('multaRescisoria')
  })
})
