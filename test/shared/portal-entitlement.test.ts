import { describe, expect, test } from 'vitest'
import {
  canAccessPortal,
  portalEntitlementStatus,
  portalUnavailableMessage,
  todayISODate,
} from '~~/shared/utils/portal-entitlement'

const HOJE = '2026-09-12'

describe('portalEntitlementStatus', () => {
  test('sem linha é sem_plano — o default é desligado', () => {
    // É o que permite subir o portal em produção sem ligar para ninguém: tenant
    // que não contratou não tem linha, e não tem acesso.
    expect(portalEntitlementStatus(null, HOJE)).toBe('sem_plano')
    expect(portalEntitlementStatus(undefined, HOJE)).toBe('sem_plano')
  })

  test('contratado e em dia é ativo', () => {
    expect(portalEntitlementStatus({ enabled: true, graceUntil: null }, HOJE)).toBe('ativo')
  })

  test('desligado dentro da carência é em_carencia', () => {
    expect(portalEntitlementStatus({ enabled: false, graceUntil: '2026-09-20' }, HOJE)).toBe(
      'em_carencia',
    )
  })

  test('o último dia da carência ainda conta', () => {
    // Cortar no dia é o tipo de off-by-one que vira ligação de cliente.
    expect(portalEntitlementStatus({ enabled: false, graceUntil: HOJE }, HOJE)).toBe('em_carencia')
  })

  test('carência vencida é suspenso', () => {
    expect(portalEntitlementStatus({ enabled: false, graceUntil: '2026-09-11' }, HOJE)).toBe(
      'suspenso',
    )
  })

  test('desligado sem carência é suspenso', () => {
    expect(portalEntitlementStatus({ enabled: false, graceUntil: null }, HOJE)).toBe('suspenso')
  })

  test('enabled vence a carência vencida', () => {
    // Pagou depois de suspenso: religar é mexer em `enabled`, sem precisar
    // limpar a carência antiga.
    expect(portalEntitlementStatus({ enabled: true, graceUntil: '2020-01-01' }, HOJE)).toBe('ativo')
  })
})

describe('canAccessPortal', () => {
  test('ativo e em_carencia entram; sem_plano e suspenso não', () => {
    expect(canAccessPortal('ativo')).toBe(true)
    expect(canAccessPortal('em_carencia')).toBe(true)
    expect(canAccessPortal('sem_plano')).toBe(false)
    expect(canAccessPortal('suspenso')).toBe(false)
  })
})

describe('portalUnavailableMessage', () => {
  test('não menciona pagamento, fatura nem inadimplência', () => {
    // Regra da política de inadimplência: quem lê é o inquilino, não a
    // imobiliária. Expor a situação comercial dela é dano de imagem a terceiro.
    const msg = portalUnavailableMessage().toLowerCase()
    for (const proibida of ['pagamento', 'pagar', 'fatura', 'inadimpl', 'cobran', 'atraso', 'mensalidade', 'plano']) {
      expect(msg, `mensagem não pode conter "${proibida}"`).not.toContain(proibida)
    }
    expect(msg).toContain('imobiliária')
  })
})

describe('todayISODate', () => {
  test('devolve só a data, no formato da coluna', () => {
    expect(todayISODate(new Date('2026-09-12T23:45:00.000Z'))).toBe('2026-09-12')
  })
})
