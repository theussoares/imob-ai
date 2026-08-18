import { describe, expect, test } from 'vitest'
import { authHashTarget } from '~~/shared/utils/auth-redirect'

const HASH_CONVITE = '#access_token=eyJabc&expires_in=3600&refresh_token=xyz&token_type=bearer&type=invite'

describe('authHashTarget', () => {
  test('manda para a tela de definir senha quando o convite cai na raiz', () => {
    // Foi o que aconteceu em produção: a allowlist do Supabase não casava com o
    // caminho, o redirect caiu no Site URL e a pessoa ficou com o token numa
    // página que não sabe o que fazer com ele.
    expect(authHashTarget(HASH_CONVITE, '/')).toBe(`/admin/definir-senha${HASH_CONVITE}`)
  })

  test('preserva o hash inteiro — é ele que carrega o token', () => {
    const alvo = authHashTarget(HASH_CONVITE, '/imoveis/casas-a-venda')
    expect(alvo?.endsWith(HASH_CONVITE)).toBe(true)
  })

  test('também atende recuperação de senha', () => {
    const hash = '#access_token=eyJabc&refresh_token=xyz&type=recovery'
    expect(authHashTarget(hash, '/')).toBe(`/admin/definir-senha${hash}`)
  })

  test('não faz nada quando já está na tela certa', () => {
    // Sem esta guarda o redirecionamento entra em laço.
    expect(authHashTarget(HASH_CONVITE, '/admin/definir-senha')).toBeNull()
  })

  test('ignora hash comum de navegação', () => {
    expect(authHashTarget('#contato', '/')).toBeNull()
    expect(authHashTarget('', '/')).toBeNull()
  })

  test('ignora hash que diz o tipo mas não traz token', () => {
    // Sem token não há o que consumir; redirecionar só levaria a pessoa para uma
    // tela de erro em vez da página que ela pediu.
    expect(authHashTarget('#type=invite', '/')).toBeNull()
  })

  test('ignora tipo de link que esta tela não trata', () => {
    expect(authHashTarget('#access_token=eyJabc&type=email_change', '/')).toBeNull()
  })
})
