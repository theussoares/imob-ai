/**
 * Fecha as telas da Área do Cliente no painel de quem não tem o recurso.
 *
 * Roda DEPOIS de `admin` (a ordem do array em `definePageMeta` é respeitada):
 * primeiro se confirma quem é a pessoa, e só então o que ela pode ver. Sem essa
 * ordem, quem não está logado cairia no redirect errado.
 *
 * ⚠️ O que isto é e o que NÃO é. É embalagem de produto: a imobiliária que não
 * contratou a Área do Cliente não deve tropeçar em telas dela. NÃO é isolamento
 * — quem chega aqui é membro autenticado, e os dados que veria seriam do
 * PRÓPRIO tenant. Quem impede alcançar dado alheio é o `requireTenantMember` nos
 * endpoints e a RLS, que não dependem desta linha.
 *
 * Existe porque esconder só o item do menu é meio caminho: o endereço continua
 * digitável, e "o link sumiu mas a página abre" é o tipo de inconsistência que
 * vira pergunta ao suporte.
 */
export default defineNuxtRouteMiddleware(async () => {
  if (import.meta.server) return

  const { areaCliente, carregar } = useAdminFeatures()
  await carregar()

  if (!areaCliente.value) {
    // Sem mensagem de erro: para esta imobiliária o recurso não existe, e dizer
    // "você não tem acesso" sugere que existe e foi negado.
    return navigateTo('/admin')
  }
})
