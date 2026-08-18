import { authHashTarget } from '~~/shared/utils/auth-redirect'

/**
 * Resgata link de convite/recuperação que caiu na página errada.
 *
 * O Supabase descarta o `redirect_to` quando ele não casa com a allowlist de
 * Redirect URLs e manda a pessoa para o Site URL — uma página qualquer, que
 * ignora o token no fragmento. Do ponto de vista de quem recebeu o convite, o
 * link simplesmente não funcionou, sem mensagem nenhuma.
 *
 * A correção de verdade é a allowlist (precisa terminar em `/**`, senão só casa
 * com o domínio nu). Isto aqui é a rede: o token chegando em qualquer página do
 * app, a pessoa acaba na tela de definir senha.
 */
export default defineNuxtPlugin(() => {
  const route = useRoute()
  const target = authHashTarget(window.location.hash, route.path)
  if (target) window.location.replace(target)
})
