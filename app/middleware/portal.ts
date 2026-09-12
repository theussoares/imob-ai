/**
 * Protege as rotas da Área do Cliente.
 *
 * Duas checagens, e a segunda é a que importa:
 *
 *  1. existe sessão no navegador (o portal é SPA, a sessão vive no localStorage);
 *  2. o SERVIDOR confirma que esta pessoa pode usar o portal.
 *
 * A segunda não é repetição da primeira. Ter sessão só prova que a pessoa se
 * autenticou em algum lugar — pode ser membro do painel, pode ser cliente de
 * outra imobiliária, pode ser cliente desativado, e pode ser cliente de um
 * tenant cujo plano está suspenso. Só o servidor conhece as quatro respostas,
 * porque só ele vê o entitlement.
 *
 * Não reimplementar a regra aqui de propósito: regra de acesso duplicada no
 * navegador é regra que vai divergir.
 */
export default defineNuxtRouteMiddleware(async () => {
  if (import.meta.server) return

  const { user, init, loadMe, signOut } = usePortalAuth()
  if (user.value === null) await init()
  if (!user.value) {
    return navigateTo('/area-cliente/login')
  }

  const me = await loadMe()
  if (!me) {
    // Recusado pelo servidor. Desloga porque a sessão não serve para este
    // portal — deixá-la de pé faria a pessoa voltar ao mesmo loop no próximo
    // clique, sem entender por quê.
    await signOut()
    return navigateTo('/area-cliente/login?erro=sem-acesso')
  }
})
