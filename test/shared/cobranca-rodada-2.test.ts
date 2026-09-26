import { describe, expect, test } from 'vitest'
import { pagadorDoContrato, pendenciasDoContrato } from '~~/shared/models/lease'

/**
 * Regras do teste de 26/09 (segunda rodada) que moram em `shared/`.
 */
describe('pagador do boleto e a pendência da ficha', () => {
  const completo = {
    rentAmount: 1300,
    dueDay: 10,
    guaranteeType: 'caucao' as const,
    finePercent: 10,
    interestMonthlyPercent: 1,
    adminFeePercent: 10,
    proprietarios: [{ temDestinoDeRepasse: true }],
  }

  test('segundo inquilino sem CPF: aviso, mas NÃO "impede o boleto" — a emissão saía normalmente', () => {
    const p = pendenciasDoContrato({ ...completo, inquilinos: [{ doc: '52998224725' }, { doc: null }] })
    const aviso = p.find((x) => x.codigo === 'inquilino_sem_documento')
    expect(aviso?.bloqueiaCobranca).toBe(false)
  })

  test('nenhum inquilino com CPF: aí sim bloqueia', () => {
    const p = pendenciasDoContrato({ ...completo, inquilinos: [{ doc: null }, { doc: null }] })
    expect(p.find((x) => x.codigo === 'inquilino_sem_documento')?.bloqueiaCobranca).toBe(true)
  })

  test('o boleto sai no nome do primeiro inquilino que TEM documento', () => {
    // A emissão pegava o primeiro da lista; com ele sem CPF, recusava mesmo
    // havendo outro inquilino apto a ser o pagador.
    expect(pagadorDoContrato([{ nome: 'A', doc: null }, { nome: 'B', doc: '52998224725' }])?.nome).toBe('B')
    expect(pagadorDoContrato([{ nome: 'A', doc: null }])?.nome).toBe('A')
    expect(pagadorDoContrato([])).toBeNull()
  })
})
