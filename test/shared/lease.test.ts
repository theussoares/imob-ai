import { describe, expect, test } from 'vitest'
import { fimDoPrazo, pendenciasDoContrato } from '~~/shared/models/lease'
import { formatarDocumento, tipoDeDocumento } from '~~/shared/utils/cpf-cnpj'

describe('CPF/CNPJ', () => {
  test('dígito verificador: o boleto é recusado pelo provedor quando não fecha', () => {
    expect(tipoDeDocumento('529.982.247-25')).toBe('cpf')
    expect(tipoDeDocumento('529.982.247-24')).toBeNull()
    expect(tipoDeDocumento('11.222.333/0001-81')).toBe('cnpj')
    expect(tipoDeDocumento('11.222.333/0001-80')).toBeNull()
  })

  test('sequência repetida fecha o dígito e mesmo assim não existe', () => {
    expect(tipoDeDocumento('111.111.111-11')).toBeNull()
    expect(tipoDeDocumento('00000000000000')).toBeNull()
  })

  test('formatação', () => {
    expect(formatarDocumento('52998224725')).toBe('529.982.247-25')
    expect(formatarDocumento('11222333000181')).toBe('11.222.333/0001-81')
  })
})

describe('fimDoPrazo', () => {
  test('12 meses a partir de 01/03 terminam na véspera do aniversário', () => {
    expect(fimDoPrazo('2026-03-01', 12)).toBe('2027-02-28')
  })

  test('30 meses (art. 46) a partir de 10/10/2026', () => {
    expect(fimDoPrazo('2026-10-10', 30)).toBe('2029-04-09')
  })

  test('dia que não existe no mês de destino cai no último dia dele', () => {
    // 31/01 + 1 mês = 28/02 (2026 não é bissexto); o fim é a véspera.
    expect(fimDoPrazo('2026-01-31', 1)).toBe('2026-02-27')
  })

  test('entrada inválida não inventa data', () => {
    expect(fimDoPrazo('01/03/2026', 12)).toBeNull()
    expect(fimDoPrazo('2026-03-01', 0)).toBeNull()
  })
})

describe('pendenciasDoContrato', () => {
  const completo = {
    rentAmount: 2400,
    dueDay: 10,
    guaranteeType: 'caucao' as const,
    finePercent: 10,
    interestMonthlyPercent: 1,
    adminFeePercent: 10,
    inquilinos: [{ doc: '52998224725' }],
    proprietarios: [{ temDestinoDeRepasse: true }],
  }

  test('contrato completo não tem pendência', () => {
    expect(pendenciasDoContrato(completo)).toEqual([])
  })

  test('inquilino sem CPF bloqueia a cobrança: o boleto exige', () => {
    const p = pendenciasDoContrato({ ...completo, inquilinos: [{ doc: null }] })
    expect(p.find((x) => x.codigo === 'inquilino_sem_documento')?.bloqueiaCobranca).toBe(true)
  })

  test('sem repasse e sem garantia avisam, mas não impedem cobrar', () => {
    const p = pendenciasDoContrato({ ...completo, guaranteeType: null, proprietarios: [{ temDestinoDeRepasse: false }] })
    expect(p.map((x) => x.codigo).sort()).toEqual(['sem_garantia', 'sem_repasse'])
    expect(p.every((x) => !x.bloqueiaCobranca)).toBe(true)
  })
})
