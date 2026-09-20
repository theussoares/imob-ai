/**
 * Fecha o editor do Quem somos para o painel de quem não tem o recurso.
 *
 * Gêmeo de `area-cliente.ts`, inclusive na ordem: roda DEPOIS de `admin`, para
 * primeiro se confirmar quem é a pessoa e só então o que ela pode ver. Sem essa
 * ordem, quem não está logado cairia no redirect errado.
 *
 * ⚠️ Como o irmão, isto é embalagem de produto e NÃO isolamento: quem chega
 * aqui é membro autenticado e o `about_content` que veria seria do PRÓPRIO
 * tenant. Existe porque esconder só o item do menu é meio caminho — o endereço
 * continua digitável, e "o link sumiu mas a página abre" vira pergunta ao
 * suporte.
 */
export default defineNuxtRouteMiddleware(async () => {
  if (import.meta.server) return

  const { quemSomos, carregar } = useAdminFeatures()
  await carregar()

  if (!quemSomos.value) {
    // Sem mensagem de erro: para esta imobiliária o recurso não existe, e dizer
    // "você não tem acesso" sugere que existe e foi negado.
    return navigateTo('/admin')
  }
})
