/**
 * Sinaliza que a sessão caiu.
 *
 * Sem isto, um 401 vira só uma mensagem de erro dentro do formulário e a pessoa
 * fica tentando salvar de novo sem entender por quê. Aconteceu com uma cliente:
 * a sessão dela tinha sido revogada em outro dispositivo, e da tela dela parecia
 * que o painel havia quebrado.
 *
 * O aviso NÃO leva para o login sozinho. Quem estava no meio de um cadastro
 * perderia tudo que digitou — e a sessão já está morta de qualquer jeito, então
 * alguns segundos a mais não mudam nada. A pessoa copia o que precisa e decide
 * a hora de sair.
 *
 * ---------------------------------------------------------------------------
 * Por que tem escopo
 * ---------------------------------------------------------------------------
 *
 * Painel e Área do Cliente são DUAS sessões, com storageKeys diferentes
 * (`imob-admin-auth` e `imob-portal-auth`), e o caso de as duas conviverem no
 * mesmo navegador é comum, não raro: a corretora abre o portal para conferir o
 * que a cliente dela está vendo.
 *
 * Sem escopo, o 401 do portal chamava `useAdminAuth().signOut()` e mandava o
 * inquilino para `/admin/login` — ou seja, derrubava a sessão do painel de quem
 * estava logado nos dois e levava o cliente final para uma tela que não é dele.
 * O estado também era compartilhado, então o banner do painel acendia por causa
 * de um erro do portal.
 */

export type SessionScope = 'admin' | 'portal'

interface ScopeConfig {
  stateKey: string
  loginPath: string
  signOut: () => Promise<void>
}

function configFor(scope: SessionScope): ScopeConfig {
  if (scope === 'portal') {
    return {
      stateKey: 'portal-session-expired',
      loginPath: '/area-cliente/login',
      signOut: () => usePortalAuth().signOut(),
    }
  }
  return {
    stateKey: 'admin-session-expired',
    loginPath: '/admin/login',
    signOut: () => useAdminAuth().signOut(),
  }
}

export function useSessionExpired(scope: SessionScope = 'admin') {
  const cfg = configFor(scope)
  const expired = useState(cfg.stateKey, () => false)

  return {
    expired,
    flag: () => {
      expired.value = true
    },
    async reconnect() {
      // Limpa o token morto antes de sair: sem isso a tela de login recarrega
      // com a sessão inválida ainda no localStorage.
      await cfg.signOut()
      expired.value = false
      await navigateTo(cfg.loginPath)
    },
  }
}
