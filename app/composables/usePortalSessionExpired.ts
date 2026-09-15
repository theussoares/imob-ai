/**
 * Sinaliza que a sessão do PORTAL caiu.
 *
 * Estado separado do `useSessionExpired` do painel de propósito: as duas
 * sessões coexistem no mesmo navegador, e um estado compartilhado faria o aviso
 * do painel aparecer para o cliente (e vice-versa) — anunciando a existência de
 * uma tela que não é dele.
 *
 * Como no painel, o aviso NÃO leva ao login sozinho: quem estava lendo um
 * documento perderia o lugar, e a sessão já está morta de qualquer jeito.
 */
export function usePortalSessionExpired() {
  const expired = useState('portal-session-expired', () => false)

  return {
    expired,
    flag: () => {
      expired.value = true
    },
    async reconnect() {
      const { signOut } = usePortalAuth()
      await signOut()
      expired.value = false
      await navigateTo('/area-cliente/login')
    },
  }
}
