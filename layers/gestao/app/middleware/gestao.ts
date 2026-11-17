import { MENU, menuVisivel } from '../../domain/permissions'

/**
 * Guarda das rotas /gestao: 1) o recurso está ligado; 2) a rota é pública ou há
 * sessão; 3) o perfil pode ver a seção.
 *
 * (1) é 404 e não redirect: com o recurso desligado o painel não deve nem
 * parecer existir. (3) usa a matriz que o Dono editou (`matrizAtual`), não a padrão.
 *
 * Públicas (sem sessão): login, convite e verificação do 2º fator. A verificação
 * só abre para quem acabou de passar pela senha («pendente de 2º fator»); sem isso
 * volta ao login — a tela de código não pode ser um ponto de entrada.
 */
export default defineNuxtRouteMiddleware((to) => {
  if (!useRuntimeConfig().public.gestaoEnabled) {
    throw createError({ statusCode: 404, statusMessage: 'Página não encontrada', fatal: true })
  }
  if (import.meta.server) return

  const { sessao, restaurar } = useGestaoSessao()
  restaurar()

  const noLogin = to.path === '/gestao/login'
  const noConvite = to.path.startsWith('/gestao/convite/')
  const noVerificar = to.path === '/gestao/verificar'
  const publica = noLogin || noConvite || noVerificar

  if (sessao.value && publica) return navigateTo('/gestao/vendas')

  if (!sessao.value) {
    if (noVerificar) {
      const { pendente, restaurarPendente } = useGestaoAuth()
      restaurarPendente()
      return pendente.value ? undefined : navigateTo('/gestao/login')
    }
    return publica ? undefined : navigateTo('/gestao/login')
  }

  // Seção mais específica primeiro: '/gestao/vendas/V-1' pertence a 'vendas', e
  // '/gestao' (dashboard) só casa exato — senão casaria com tudo.
  const secao = MENU.filter((m) => (m.rota === '/gestao' ? to.path === '/gestao' : to.path.startsWith(m.rota)))
    .sort((a, b) => b.rota.length - a.rota.length)[0]
  if (secao && !menuVisivel(useGestaoStore().matrizAtual(), sessao.value.perfil, secao.chave)) return navigateTo('/gestao/vendas')
})
