import { describe, expect, test } from 'vitest'
import { credencialDaUrl, linkRecusadoNaUrl, validarNovaSenha } from '~~/shared/utils/auth-credencial'
import { linkDeAcesso } from '~~/server/utils/auth-link'

/**
 * Como o token do convite chega na tela de definir senha.
 *
 * Isto estava copiado LITERALMENTE em `app/pages/admin/definir-senha.vue` e em
 * `app/pages/area-cliente/definir-senha.vue`, e as duas cópias já tinham
 * derivado uma da outra no tratamento de erro. A lógica é a mesma nas duas
 * telas; o que difere é só o client do Supabase e para onde a pessoa vai
 * depois.
 *
 * ⚠️ O modo de falhar aqui é sempre o mesmo e é o pior possível: a pessoa
 * clica no link do convite e encontra uma tela morta, sem explicação nenhuma.
 * No portal ela é um cliente final, que não tem a quem recorrer além do
 * WhatsApp da imobiliária.
 */

// BUG-FUN-03 (27/09): o convite colado no WhatsApp chegava morto. A prévia do
// link abria o `/auth/v1/verify` do Supabase, que é de uso único e se gasta no
// GET. O link agora aponta para a nossa página com `token_hash`, e a tela só
// verifica quando a pessoa clica.
describe('link que a prévia não gasta', () => {
  const props = { hashed_token: 'h4sh', verification_type: 'invite', action_link: 'https://supabase/auth/v1/verify?token=x' }

  test('aponta para a nossa tela, não para o /verify do Supabase', () => {
    const link = linkDeAcesso('https://aurora.usemoradi.com.br/admin/definir-senha', props)!
    expect(link.startsWith('https://aurora.usemoradi.com.br/admin/definir-senha?')).toBe(true)
    expect(link).not.toContain('/auth/v1/verify')
    expect(credencialDaUrl(link)).toEqual({ tipo: 'token_hash', tokenHash: 'h4sh', otp: 'invite' })
  })

  test('sem hashed_token cai no link antigo em vez de não mandar nada', () => {
    expect(linkDeAcesso('https://x.com.br/a', { action_link: 'https://antigo' })).toBe('https://antigo')
  })

  test('tipo fora da lista não vira credencial', () => {
    expect(credencialDaUrl('https://x.com.br/a?token_hash=h&type=email_change')).toBeNull()
  })

  test('link antigo recusado pelo Supabase é reconhecido pelo fragmento', () => {
    expect(linkRecusadoNaUrl('https://x.com.br/a#error=access_denied&error_code=otp_expired')).toBe(true)
    expect(linkRecusadoNaUrl('https://x.com.br/a')).toBe(false)
  })
})

describe('credencialDaUrl', () => {
  test('PKCE: o código vem na query', () => {
    expect(credencialDaUrl('https://x.com.br/area-cliente/definir-senha?code=abc123')).toEqual({
      tipo: 'code',
      code: 'abc123',
    })
  })

  test('implícito: os tokens vêm no fragmento', () => {
    // O fragmento nunca chega ao servidor — é por isso que este caminho existe
    // só no cliente, e por isso o SSR não pode decidir nada a partir dele.
    const href =
      'https://x.com.br/area-cliente/definir-senha#access_token=AAA&refresh_token=BBB&type=invite'
    expect(credencialDaUrl(href)).toEqual({
      tipo: 'tokens',
      accessToken: 'AAA',
      refreshToken: 'BBB',
    })
  })

  test('sem credencial nenhuma devolve null', () => {
    // Quem já estava logado e digitou o endereço direto cai aqui. Não é erro:
    // a tela consulta a sessão existente antes de se declarar inválida.
    expect(credencialDaUrl('https://x.com.br/admin/definir-senha')).toBeNull()
  })

  test('o código vence os tokens quando os dois vêm juntos', () => {
    // Ordem preservada das duas telas originais. Trocar a precedência mudaria
    // qual credencial é consumida num link que traga as duas, e isso não pode
    // depender de qual arquivo alguém editou por último.
    const href = 'https://x.com.br/admin/definir-senha?code=abc#access_token=AAA&refresh_token=BBB'
    expect(credencialDaUrl(href)).toEqual({ tipo: 'code', code: 'abc' })
  })

  test('access_token sem refresh_token não vale', () => {
    // `setSession` exige os dois. Devolver um par pela metade daria erro do
    // Supabase em vez do caminho de sessão existente, que é o correto aqui.
    expect(
      credencialDaUrl('https://x.com.br/admin/definir-senha#access_token=AAA'),
    ).toBeNull()
  })

  test('code vazio não conta como credencial', () => {
    // `?code=` sozinho aparece quando algum redirecionamento no meio come o
    // valor. Tratar como presente mandaria uma string vazia para o Supabase.
    expect(credencialDaUrl('https://x.com.br/admin/definir-senha?code=')).toBeNull()
  })

  test('o valor do token é decodificado', () => {
    // O Supabase percent-encoda os tokens no fragmento. Entregar o valor cru
    // faria a sessão ser recusada por um `+` ou `/` que virou `%2B`/`%2F`.
    const href = 'https://x.com.br/admin/definir-senha#access_token=a%2Bb&refresh_token=c%2Fd'
    expect(credencialDaUrl(href)).toEqual({ tipo: 'tokens', accessToken: 'a+b', refreshToken: 'c/d' })
  })

  test('URL sem sentido não derruba a tela', () => {
    // Melhor cair no estado "link inválido", que explica o que houve, do que
    // numa exceção que deixa o cartão vazio na tela.
    expect(() => credencialDaUrl('nem-url-isso-é')).not.toThrow()
  })
})

describe('validarNovaSenha', () => {
  test('senha curta é recusada', () => {
    expect(validarNovaSenha('1234567', '1234567')).toBe(
      'A senha precisa ter pelo menos 8 caracteres.',
    )
  })

  test('oito caracteres já serve', () => {
    // A borda exata: `<= 8` em vez de `< 8` recusaria uma senha válida e a
    // pessoa não teria como descobrir o que há de errado com ela.
    expect(validarNovaSenha('12345678', '12345678')).toBeNull()
  })

  test('as duas senhas precisam bater', () => {
    expect(validarNovaSenha('12345678', '87654321')).toBe('As duas senhas não são iguais.')
  })

  test('senha curta é apontada antes da diferença', () => {
    // Com os dois problemas ao mesmo tempo, dizer "são diferentes" mandaria a
    // pessoa corrigir a confirmação e esbarrar no tamanho logo depois — dois
    // erros em sequência para um preenchimento só.
    expect(validarNovaSenha('123', '456')).toBe('A senha precisa ter pelo menos 8 caracteres.')
  })

  test('senha válida e igual não tem o que reclamar', () => {
    expect(validarNovaSenha('senha-boa-123', 'senha-boa-123')).toBeNull()
  })
})
