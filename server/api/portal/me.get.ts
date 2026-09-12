/**
 * Quem está logado no portal.
 *
 * Endpoint mínimo, e é o único lugar em que o navegador pergunta "eu posso estar
 * aqui?". Toda a decisão está em `requirePortalUser`: vínculo ativo com ESTE
 * tenant e entitlement do tenant em dia. Recusa vem como 401 ou 403 com
 * mensagem legível.
 *
 * Devolve só o que a tela usa. `entitlementStatus` fica FORA da resposta de
 * propósito: 'em_carencia' é informação comercial da imobiliária, e quem lê isto
 * é o inquilino.
 */
export default defineEventHandler(async (event) => {
  const { tenant, portalUserName } = await requirePortalUser(event)
  return {
    name: portalUserName,
    tenantName: tenant.name,
  }
})
