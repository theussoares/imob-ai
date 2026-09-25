import { describe, expect, test } from 'vitest'
import {
  calcularRepasse,
  competenciaParaData,
  estadoDaCobranca,
  feriadosBancarios,
  hojeEmSaoPaulo,
  impedimentosDeEmissao,
  somar,
  somarDiasUteis,
  vencimentoPadrao,
} from '~~/shared/models/cobranca'

/**
 * As regras de dinheiro da cobrança (spec 25/09, B3). Cada uma aqui, errada,
 * vira boleto com valor errado, inquilino cobrado de uma dívida paga ou
 * proprietário recebendo a menos — e nenhuma delas dá erro em tempo de
 * execução.
 */

const base = { canceledAt: null, issuedAt: '2026-10-01T12:00:00Z', issuedAmount: 2400, dueOn: '2026-10-10', total: 2400, settledTotal: 0 }

describe('estado derivado (B3.4)', () => {
  test('pagar NO dia do vencimento é pagar em dia; vencida só no dia seguinte', () => {
    expect(estadoDaCobranca(base, '2026-10-10')).toBe('emitida')
    expect(estadoDaCobranca(base, '2026-10-11')).toBe('vencida')
  })

  test('rascunho, emitindo (trava sem valor congelado) e cancelada', () => {
    expect(estadoDaCobranca({ ...base, issuedAt: null, issuedAmount: null })).toBe('rascunho')
    expect(estadoDaCobranca({ ...base, issuedAmount: null })).toBe('emitindo')
    // Cancelada vence tudo: um estorno depois do cancelamento não a reabre.
    expect(estadoDaCobranca({ ...base, canceledAt: '2026-10-02', settledTotal: 2400 })).toBe('cancelada')
  })

  test('paga é contra o total CORRENTE: desconto lançado depois da emissão reduz o devido', () => {
    expect(estadoDaCobranca({ ...base, total: 2300, settledTotal: 2300 })).toBe('paga')
    expect(estadoDaCobranca({ ...base, settledTotal: 1000 }, '2026-10-20')).toBe('parcial')
    // Pago com multa e juros: acima do total continua paga, não "parcial".
    expect(estadoDaCobranca({ ...base, settledTotal: 2455.2 })).toBe('paga')
  })

  test('estorno total volta a cobrança para em aberto/vencida', () => {
    expect(estadoDaCobranca({ ...base, settledTotal: 0 }, '2026-10-20')).toBe('vencida')
  })
})

describe('vencimento e competência (0041: competência é mês de OCUPAÇÃO)', () => {
  test('aluguel vencido é a regra: o de setembro vence em outubro (Lei 8.245)', () => {
    expect(vencimentoPadrao('2026-09-01', 10)).toBe('2026-10-10')
    expect(vencimentoPadrao('2026-12-01', 5)).toBe('2027-01-05')
  })

  test('dia 31 em mês curto cai no último dia, não no mês seguinte', () => {
    expect(vencimentoPadrao('2027-01-01', 31)).toBe('2027-02-28')
    expect(vencimentoPadrao('2028-01-01', 30)).toBe('2028-02-29')
  })

  test('competência sempre no dia 1 (CHECK da 0042)', () => {
    expect(competenciaParaData('2026-09')).toBe('2026-09-01')
  })
})

describe('dias úteis bancários (prazo do repasse)', () => {
  test('pula fim de semana e feriado nacional', () => {
    // Sexta 04/09/2026 + 1 dia útil: segunda 07/09 é Independência → terça.
    expect(somarDiasUteis('2026-09-04', 1)).toBe('2026-09-08')
    expect(somarDiasUteis('2026-10-09', 5)).toBe('2026-10-19') // 12/10 no meio
  })

  test('feriados móveis em que banco não abre: Carnaval, Sexta Santa, Corpus Christi', () => {
    // Páscoa de 2027: 28/03.
    const f = feriadosBancarios(2027)
    for (const d of ['2027-02-08', '2027-02-09', '2027-03-26', '2027-05-27']) expect(f.has(d), d).toBe(true)
    // 20/11 é feriado nacional desde a Lei 14.759/2023.
    expect(f.has('2027-11-20')).toBe(true)
  })
})

describe('repasse ao proprietário (B3.8)', () => {
  test('taxa de administração só sobre o aluguel — condomínio e IPTU são repasse puro', () => {
    const itens = [
      { kind: 'aluguel' as const, amount: 2400 },
      { kind: 'condominio' as const, amount: 480 },
      { kind: 'iptu' as const, amount: 95.5 },
    ]
    const r = calcularRepasse(itens, 2975.5, 10)
    expect(r.taxaAdm).toBe(240)
    expect(r.liquido).toBe(2735.5)
  })

  test('desconto concedido no aluguel reduz a base da taxa', () => {
    const r = calcularRepasse([{ kind: 'aluguel', amount: 2400 }, { kind: 'desconto', amount: -200 }], 2200, 10)
    expect(r.taxaAdm).toBe(220)
  })

  test('multa e juros pagos no atraso ficam com o proprietário, fora da base da taxa', () => {
    const r = calcularRepasse([{ kind: 'aluguel', amount: 2400 }], 2455.2, 10)
    expect(r.bruto).toBe(2455.2)
    expect(r.taxaAdm).toBe(240)
  })

  test('centavos fecham (soma em inteiros, não em float)', () => {
    expect(somar([0.1, 0.2])).toBe(0.3)
    expect(calcularRepasse([{ kind: 'aluguel', amount: 1333.33 }], 1333.33, 8).taxaAdm).toBe(106.67)
  })
})

describe('o que impede emitir', () => {
  test('lista cada motivo em português, para a tela mostrar tudo de uma vez', () => {
    const r = impedimentosDeEmissao({ status: 'rascunho', total: 2400, inquilinoTemDocumento: false, contaConfigurada: false })
    expect(r.join(' ')).toMatch(/CPF\/CNPJ/)
    expect(r.join(' ')).toMatch(/Configurações → Cobrança/)
    expect(impedimentosDeEmissao({ status: 'emitida', total: 2400, inquilinoTemDocumento: true, contaConfigurada: true })).toHaveLength(1)
  })

  test('hoje é data civil de São Paulo, não UTC', () => {
    // 01h UTC de 11/10 ainda é 10/10 em São Paulo: um vencimento no dia 10
    // não pode virar "vencida" às 22h do próprio dia.
    expect(hojeEmSaoPaulo(new Date('2026-10-11T01:00:00Z'))).toBe('2026-10-10')
  })
})
