import { describe, expect, test } from 'vitest'
import {
  chaveDeFalha,
  decidirEnvioOtp,
  decidirVerificacaoOtp,
  hashCodigoOtp,
  type EstadoOtp,
} from '~~/server/utils/gestao-otp'
import { CODIGO_BLOQUEIO_MS, CODIGO_REENVIO_MS, CODIGO_VALIDADE_MS } from '~~/layers/gestao/domain/auth'

/**
 * Regras do 2º fator do /gestao (Review Focus 4 do plano). O código de 6 dígitos
 * tem 10⁶ combinações: o que o protege é o limite de tentativas, e é ele que cada
 * teste daqui tenta furar — reuso, código de outra conta, código certo depois do
 * bloqueio, código novo para zerar o contador.
 */
const PEPPER = 'pepper-de-teste'
const T = 'tenant-a'
const U = 'user-a'
const AGORA = Date.UTC(2026, 10, 17, 12, 0, 0)

const hash = (codigo: string, tenant = T, user = U) => hashCodigoOtp(PEPPER, tenant, user, codigo)

function estado(over: Partial<EstadoOtp> = {}): EstadoOtp {
  return {
    codeHash: hash('123456'),
    expiraEm: AGORA + CODIGO_VALIDADE_MS,
    tentativas: 0,
    bloqueadoAte: null,
    enviadoEm: AGORA,
    consumidoEm: null,
    ...over,
  }
}

describe('hashCodigoOtp', () => {
  test('o mesmo código de outro usuário ou de outro tenant não casa', () => {
    expect(hash('123456')).not.toBe(hash('123456', T, 'user-b'))
    expect(hash('123456')).not.toBe(hash('123456', 'tenant-b', U))
  })

  test('sem o pepper o hash é outro: um dump do banco não basta para testar os 10⁶ códigos', () => {
    expect(hashCodigoOtp('outro', T, U, '123456')).not.toBe(hash('123456'))
  })
})

describe('decidirEnvioOtp', () => {
  test('primeiro código sai com tentativas zeradas', () => {
    expect(decidirEnvioOtp(null, AGORA)).toEqual({ ok: true, tentativas: 0 })
  })

  test('antes de 60 s não sai outro código', () => {
    const r = decidirEnvioOtp(estado(), AGORA + 10_000)
    expect(r).toMatchObject({ ok: false, motivo: 'aguarde', segundos: 50 })
  })

  test('código já usado não segura o próximo login', () => {
    expect(decidirEnvioOtp(estado({ consumidoEm: AGORA }), AGORA + 1000)).toEqual({ ok: true, tentativas: 0 })
  })

  test('durante o bloqueio não sai código novo — senão o bloqueio não bloquearia nada', () => {
    const r = decidirEnvioOtp(estado({ tentativas: 5, bloqueadoAte: AGORA + CODIGO_BLOQUEIO_MS }), AGORA + CODIGO_REENVIO_MS * 2)
    expect(r).toMatchObject({ ok: false, motivo: 'bloqueado' })
  })

  test('código novo NÃO zera as tentativas: 4 erros + login de novo não dão mais 5 palpites', () => {
    const r = decidirEnvioOtp(estado({ tentativas: 4 }), AGORA + CODIGO_REENVIO_MS)
    expect(r).toEqual({ ok: true, tentativas: 4 })
  })

  test('bloqueio vencido zera as tentativas', () => {
    const atual = estado({ tentativas: 5, enviadoEm: AGORA - CODIGO_BLOQUEIO_MS, bloqueadoAte: AGORA + 1000 })
    expect(decidirEnvioOtp(atual, AGORA + 2000)).toEqual({ ok: true, tentativas: 0 })
  })
})

describe('decidirVerificacaoOtp', () => {
  test('código certo passa, consome e zera as tentativas', () => {
    const r = decidirVerificacaoOtp(estado({ tentativas: 3 }), hash('123456'), AGORA + 1000)
    expect(r.ok).toBe(true)
    expect(r.novo).toMatchObject({ consumidoEm: AGORA + 1000, tentativas: 0 })
  })

  test('reuso falha: código consumido não vale de novo', () => {
    const r = decidirVerificacaoOtp(estado({ consumidoEm: AGORA }), hash('123456'), AGORA + 1000)
    expect(r).toMatchObject({ ok: false, motivo: 'inexistente' })
    expect(r.novo).toBeUndefined()
  })

  test('sem código emitido falha sem gravar nada', () => {
    expect(decidirVerificacaoOtp(null, hash('123456'), AGORA)).toMatchObject({ ok: false, motivo: 'inexistente' })
  })

  test('expirado falha', () => {
    const r = decidirVerificacaoOtp(estado(), hash('123456'), AGORA + CODIGO_VALIDADE_MS)
    expect(r).toMatchObject({ ok: false, motivo: 'expirado' })
  })

  test('código de outro usuário não serve, e conta como erro', () => {
    const r = decidirVerificacaoOtp(estado(), hash('123456', T, 'user-b'), AGORA + 1000)
    expect(r).toMatchObject({ ok: false, motivo: 'invalido', restantes: 4 })
    expect(r.novo?.tentativas).toBe(1)
  })

  test('o 5º erro bloqueia 15 min e a 6ª tentativa, mesmo com o código CERTO, é recusada', () => {
    let atual = estado()
    for (let i = 1; i <= 5; i++) {
      const r = decidirVerificacaoOtp(atual, hash('000000'), AGORA + i)
      expect(r.ok).toBe(false)
      atual = r.novo!
    }
    expect(atual.tentativas).toBe(5)
    expect(atual.bloqueadoAte).toBe(AGORA + 5 + CODIGO_BLOQUEIO_MS)

    const sexta = decidirVerificacaoOtp(atual, hash('123456'), AGORA + 60_000)
    expect(sexta).toMatchObject({ ok: false, motivo: 'bloqueado' })
    // Mesma resposta para certo e errado: senão o bloqueio vira oráculo.
    const sextaErrada = decidirVerificacaoOtp(atual, hash('999999'), AGORA + 60_000)
    expect(sextaErrada.motivo).toBe(sexta.motivo)
    expect(sexta.novo).toBeUndefined()
  })

  test('bloqueio vencido: as tentativas zeram e o código certo (ainda válido) passa', () => {
    const atual = estado({ tentativas: 5, bloqueadoAte: AGORA + 1000, expiraEm: AGORA + CODIGO_VALIDADE_MS })
    const r = decidirVerificacaoOtp(atual, hash('123456'), AGORA + 2000)
    expect(r.ok).toBe(true)
  })

  test('bloqueio vencido e erro de novo: conta 1, não rebloqueia na hora', () => {
    const atual = estado({ tentativas: 5, bloqueadoAte: AGORA + 1000 })
    const r = decidirVerificacaoOtp(atual, hash('000000'), AGORA + 2000)
    expect(r).toMatchObject({ ok: false, motivo: 'invalido', restantes: 4 })
  })
})

describe('chaveDeFalha', () => {
  test('não guarda e-mail nem IP em claro, e separa conta de IP', () => {
    const conta = chaveDeFalha(PEPPER, 'conta', 'Fulano@Imob.com ')
    expect(conta).not.toContain('fulano')
    expect(conta).toBe(chaveDeFalha(PEPPER, 'conta', 'fulano@imob.com'))
    expect(chaveDeFalha(PEPPER, 'ip', 'fulano@imob.com')).not.toBe(conta)
  })
})
