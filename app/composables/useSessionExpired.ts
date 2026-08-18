/**
 * Sinaliza que a sessão do painel caiu.
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
 */
export function useSessionExpired() {
  const expired = useState('admin-session-expired', () => false)

  return {
    expired,
    flag: () => {
      expired.value = true
    },
    async reconnect() {
      const { signOut } = useAdminAuth()
      // Limpa o token morto antes de sair: sem isso a tela de login recarrega
      // com a sessão inválida ainda no localStorage.
      await signOut()
      expired.value = false
      await navigateTo('/admin/login')
    },
  }
}
