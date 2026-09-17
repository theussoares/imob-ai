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

  /**
   * ⚠️ O bug que motivou este bloco, visto em produção em 17/09.
   *
   * O convite do PORTAL aterrissava certo em `/area-cliente/definir-senha` — o
   * `redirect_to` estava correto, a allowlist do Supabase cobria, e o Supabase
   * honrava (conferido batendo no `/verify` com token inválido: ele devolve 303
   * para o caminho do portal). Este resgate é que sequestrava o token e o
   * mandava para `/admin/definir-senha`, porque o destino era uma constante.
   *
   * A pessoa definia a senha na tela do PAINEL, era mandada para `/admin`, o
   * middleware via que ela não é membro do tenant e a jogava no login do painel
   * com "sua conta não tem acesso a esta imobiliária" — mensagem que não tem
   * nada a ver com o que ela estava fazendo.
   *
   * A ironia: este plugin existe para salvar convites cujo `redirect_to` o
   * Supabase tivesse DESCARTADO. Com a allowlist correta, ele virou dano puro e
   * passou a causar o beco sem saída que existia para evitar.
   */
  describe('o portal tem a própria tela de definir senha', () => {
    test('não sequestra o convite que já caiu na tela do portal', () => {
      expect(authHashTarget(HASH_CONVITE, '/area-cliente/definir-senha')).toBeNull()
    })

    test('recuperação de senha do portal também fica onde está', () => {
      const hash = '#access_token=eyJabc&refresh_token=xyz&type=recovery'
      expect(authHashTarget(hash, '/area-cliente/definir-senha')).toBeNull()
    })

    test('token perdido DENTRO do portal vai para a tela do portal', () => {
      // O resgate continua existindo; o que muda é para onde ele resgata. Quem
      // estava no portal não pode ser despejado no painel, onde não tem acesso.
      expect(authHashTarget(HASH_CONVITE, '/area-cliente')).toBe(
        `/area-cliente/definir-senha${HASH_CONVITE}`,
      )
      expect(authHashTarget(HASH_CONVITE, '/area-cliente/login')).toBe(
        `/area-cliente/definir-senha${HASH_CONVITE}`,
      )
    })

    test('fora do portal, o destino continua sendo o painel', () => {
      // A regra antiga não muda para quem não está no portal: é o fluxo de
      // convite de usuário do painel, que continua valendo.
      expect(authHashTarget(HASH_CONVITE, '/')).toBe(`/admin/definir-senha${HASH_CONVITE}`)
      expect(authHashTarget(HASH_CONVITE, '/admin/imoveis')).toBe(
        `/admin/definir-senha${HASH_CONVITE}`,
      )
    })

    test('não confunde um caminho que só começa parecido', () => {
      // `/area-clientes` (com s) não é o portal. Sem a barra na comparação,
      // um caminho novo com prefixo parecido herdaria o destino errado.
      expect(authHashTarget(HASH_CONVITE, '/area-clientes-fake')).toBe(
        `/admin/definir-senha${HASH_CONVITE}`,
      )
    })
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
