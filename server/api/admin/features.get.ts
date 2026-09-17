import { recursoAtivo } from '~~/shared/utils/portal-access'

/**
 * Quais recursos opcionais estão ligados para ESTA imobiliária.
 *
 * Existe porque o painel precisava saber algo que o payload público do tenant
 * não deve carregar: se a imobiliária tem a Área do Cliente contratada. Isso é
 * informação comercial — vai para quem é membro dela, e não para todo visitante
 * do site.
 *
 * ⚠️ NÃO é controle de acesso, e a distinção importa. Quem fecha o portal para
 * o cliente final é a RLS (`portal_my_parties()` lê `tenant_features`) e o
 * `requirePortalUser`. O que esta resposta faz é evitar que o painel ofereça
 * telas de um recurso que a imobiliária não tem — e um membro que digite a URL
 * direto continua vendo dados do PRÓPRIO tenant, nunca de outro.
 *
 * Service role de propósito: `tenant_features` não tem policy de leitura para
 * `authenticated`, e é assim que ela fica fora do alcance de quem não deveria
 * mexer no que é cobrado. Mesmo caminho que `requirePortalUser` já usa.
 */
export default defineEventHandler(async (event) => {
  const { tenant } = await requireTenantMember(event)

  const { data } = await serviceSupabase()
    .from('tenant_features')
    .select('enabled, grace_until')
    .eq('tenant_id', tenant.id)
    .eq('feature', 'portal')
    .maybeSingle()

  // A MESMA função que o portal usa. A régua de carência não pode ter duas
  // implementações que discordam: o painel escondendo a tela enquanto o cliente
  // ainda entra (ou o contrário) é pior que qualquer um dos dois estados.
  return {
    areaCliente: recursoAtivo(
      data ? { enabled: data.enabled, graceUntil: data.grace_until } : null,
    ),
  }
})
