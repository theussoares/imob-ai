import { afterEach, describe, expect, test, vi } from 'vitest'
import { cifrar, decifrar, cifrarCredenciaisCora, obterCredenciaisCora } from '~~/server/utils/cofre'
import { CERT_A, KEY_A } from '../fixtures/certificados'

/**
 * Credenciais da Cora no cofre: o par certificado + chave nunca fica legível
 * no banco, e quem as lê recebe um objeto tipado — sem saber o formato.
 */

vi.stubGlobal('createError', (o: unknown) => Object.assign(new Error((o as { statusMessage: string }).statusMessage), o))
vi.stubGlobal('useRuntimeConfig', () => ({ paymentsEncryptionKey: 'chave-mestra-de-teste-com-mais-de-32-caracteres' }))
vi.stubGlobal('segredoDeRuntime', (v: string) => v)
vi.stubGlobal('logError', () => {})
afterEach(() => vi.clearAllMocks())

describe('credenciais da Cora', () => {
  test('o texto guardado não contém o PEM, e volta inteiro com o client_id da coluna', () => {
    const guardado = cifrarCredenciaisCora({ certificatePem: CERT_A, privateKeyPem: KEY_A })
    expect(guardado).not.toMatch(/BEGIN|PRIVATE KEY|CERTIFICATE/)
    expect(obterCredenciaisCora({ client_id: 'int-abc', credentials_ciphertext: guardado })).toEqual({
      clientId: 'int-abc',
      certificatePem: CERT_A,
      privateKeyPem: KEY_A,
    })
  })

  test('conta sem credencial (ou com o texto adulterado) pede reconexão em vez de subir lixo', () => {
    expect(() => obterCredenciaisCora({ client_id: null, credentials_ciphertext: 'x' })).toThrow(/Reconecte/)
    expect(() => obterCredenciaisCora({ client_id: 'int-abc', credentials_ciphertext: null })).toThrow(/Reconecte/)
    const adulterado = cifrar('{"certificatePem":"x"}')
    expect(() => obterCredenciaisCora({ client_id: 'int-abc', credentials_ciphertext: adulterado })).toThrow(/Reconecte/)
    const g = cifrarCredenciaisCora({ certificatePem: CERT_A, privateKeyPem: KEY_A })
    expect(() => decifrar(g.slice(0, -4) + 'AAAA')).toThrow()
  })
})
