import { describe, expect, test } from 'vitest'
import {
  assertAudience,
  assertContractInput,
  assertPortalUserInput,
} from '~~/server/utils/validate'

const CONTRATO_OK = {
  code: 'LOC-001',
  addressLabel: 'Rua Capitão Ramão Nunes, 1359',
  startedOn: '2026-09-11',
  endsOn: '2027-09-11',
  rentAmount: 3000,
  dueDay: 11,
}

describe('assertContractInput', () => {
  test('aceita o contrato real que modelou a feature', () => {
    expect(() => assertContractInput(CONTRATO_OK)).not.toThrow()
  })

  test('exige código', () => {
    expect(() => assertContractInput({ ...CONTRATO_OK, code: '  ' })).toThrow()
  })

  test('recusa dia de vencimento fora de 1..31', () => {
    // Mesma regra da constraint da 0028, adiantada para virar mensagem legível.
    expect(() => assertContractInput({ ...CONTRATO_OK, dueDay: 0 })).toThrow()
    expect(() => assertContractInput({ ...CONTRATO_OK, dueDay: 45 })).toThrow()
    expect(() => assertContractInput({ ...CONTRATO_OK, dueDay: 11 })).not.toThrow()
  })

  test('recusa contrato que termina antes de começar', () => {
    expect(() =>
      assertContractInput({ ...CONTRATO_OK, startedOn: '2027-09-11', endsOn: '2026-09-11' }),
    ).toThrow()
  })

  test('exige imóvel do catálogo OU endereço escrito', () => {
    // Sem um dos dois o contrato não tem como ser identificado na tela.
    const semNada = { code: 'LOC-002' }
    expect(() => assertContractInput(semNada)).toThrow()
    expect(() => assertContractInput({ ...semNada, propertyId: '3f0c1f8e-5d7a-4b8e-9a51-2f6d0c7e9b11' })).not.toThrow()
    // Id que nem é uuid não chega ao banco (onde viraria erro 500 do Postgres).
    expect(() => assertContractInput({ ...semNada, propertyId: 'imovel-1' })).toThrow(/Imóvel inválido/)
    expect(() => assertContractInput({ ...semNada, addressLabel: 'Rua X, 10' })).not.toThrow()
  })
})

describe('assertPortalUserInput', () => {
  test('exige nome e e-mail válido', () => {
    // E-mail errado aqui não é campo errado: é convite entregue a outra pessoa.
    expect(() => assertPortalUserInput({ name: 'Giane', email: 'giane@exemplo.com' })).not.toThrow()
    expect(() => assertPortalUserInput({ name: '', email: 'giane@exemplo.com' })).toThrow()
    expect(() => assertPortalUserInput({ name: 'Giane', email: 'giane-arroba' })).toThrow()
  })
})

describe('assertAudience', () => {
  test('recusa audiência vazia', () => {
    // Publicaria um documento que ninguém vê, e o suporte vira "publiquei e o
    // cliente diz que não está lá".
    expect(() => assertAudience([])).toThrow()
  })

  test('recusa papel que não existe', () => {
    expect(() => assertAudience(['inquilino', 'sindico'])).toThrow()
  })

  test('aceita os papéis do contrato', () => {
    expect(() => assertAudience(['inquilino', 'proprietario', 'fiador'])).not.toThrow()
  })
})
