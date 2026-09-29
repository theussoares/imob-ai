import { describe, expect, test } from 'vitest'
import { competenciaCurta, dataBR, dinheiroBR, mesPorExtenso, urlHttps } from '../../app/utils/portal-format'

/**
 * Formatação da Área do Cliente — o que o inquilino lê antes de pagar.
 *
 * O caso que justifica o arquivo é o primeiro: data de vencimento com um dia a
 * menos é multa que a pessoa não devia. Acontece com `new Date('AAAA-MM-DD')`,
 * que é meia-noite em UTC — ainda o dia anterior no Brasil — e não aparece em
 * nenhum teste rodado numa máquina em UTC. Por isso o fuso é forçado aqui.
 */
describe('dataBR', () => {
  test('não perde um dia no fuso do Brasil', () => {
    const tz = process.env.TZ
    process.env.TZ = 'America/Campo_Grande'
    try {
      expect(dataBR('2026-10-01')).toBe('01/10/2026')
      expect(dataBR('2026-01-01')).toBe('01/01/2026')
    } finally {
      process.env.TZ = tz
    }
  })

  test('vazio vira travessão, não "undefined/undefined"', () => {
    expect(dataBR(null)).toBe('—')
    expect(dataBR(undefined)).toBe('—')
    expect(dataBR('')).toBe('—')
  })
})

describe('dinheiroBR', () => {
  test('formata em real', () => {
    expect(dinheiroBR(2350).replace(/\s/g, ' ')).toBe('R$ 2.350,00')
  })

  test('zero é valor, nulo é ausência', () => {
    // Um aluguel "R$ 0,00" e um aluguel não informado são coisas diferentes;
    // o `!v` óbvio juntaria os dois no travessão.
    expect(dinheiroBR(0).replace(/\s/g, ' ')).toBe('R$ 0,00')
    expect(dinheiroBR(null)).toBe('—')
  })
})

describe('competência', () => {
  test('por extenso, em minúsculas (a frase decide a maiúscula)', () => {
    expect(mesPorExtenso('2026-09-01')).toBe('setembro de 2026')
    expect(mesPorExtenso('2026-03-01')).toBe('março de 2026')
  })

  test('curta', () => {
    expect(competenciaCurta('2026-08-01')).toBe('08/2026')
    expect(competenciaCurta(null)).toBe('')
  })
})

describe('urlHttps — href com dado do banco', () => {
  test('https passa inteiro', () => {
    expect(urlHttps('https://www.asaas.com/i/abc123')).toBe('https://www.asaas.com/i/abc123')
  })

  test.each([
    ['javascript:alert(document.cookie)'],
    ['JavaScript:alert(1)'],
    [' javascript:alert(1)'],
    ['data:text/html,<script>alert(1)</script>'],
    ['http://asaas.com/i/abc'],
    ['//evil.example/boleto'],
    ['/relativo'],
    ['não é url'],
  ])('%s não vira link', (u) => {
    expect(urlHttps(u)).toBeNull()
  })

  test('vazio não vira link', () => {
    expect(urlHttps(null)).toBeNull()
    expect(urlHttps('')).toBeNull()
  })
})
