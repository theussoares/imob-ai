import { matrizPadrao, MENU, menuVisivel } from '../../domain/permissions'

/**
 * Guarda das rotas /gestao: 1) o recurso está ligado; 2) há perfil escolhido;
 * 3) o perfil pode ver a seção.
 *
 * (1) é 404 e não redirect: com o recurso desligado o painel não deve nem
 * parecer existir. (3) usa a matriz padrão — a matriz editável pelo Dono é um
 * item pós-demo, e quando existir esta guarda passa a ler do store.
 */
export default defineNuxtRouteMiddleware((to) => {
  if (!useRuntimeConfig().public.gestaoEnabled) {
    throw createError({ statusCode: 404, statusMessage: 'Página não encontrada', fatal: true })
  }
  if (import.meta.server) return

  const { sessao, restaurar } = useGestaoSessao()
  restaurar()

  const noLogin = to.path === '/gestao/login'
  if (!sessao.value) return noLogin ? undefined : navigateTo('/gestao/login')
  if (noLogin) return navigateTo('/gestao/vendas')

  // Seção mais específica primeiro: '/gestao/vendas/V-1' pertence a 'vendas', e
  // '/gestao' (dashboard) só casa exato — senão casaria com tudo.
  const secao = MENU.filter((m) => (m.rota === '/gestao' ? to.path === '/gestao' : to.path.startsWith(m.rota)))
    .sort((a, b) => b.rota.length - a.rota.length)[0]
  if (secao && !menuVisivel(matrizPadrao(), sessao.value.perfil, secao.chave)) return navigateTo('/gestao/vendas')
})
