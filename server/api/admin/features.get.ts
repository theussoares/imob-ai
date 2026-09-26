import { areaClienteAtiva, cobrancaAtiva, crmAtivo, quemSomosAtiva, descricaoIaAtiva } from '~~/server/utils/entitlement'

/**
 * Quais recursos opcionais estão ligados para ESTA imobiliária.
 *
 * Existe porque o painel precisa saber algo que o payload público do tenant não
 * carrega: se a imobiliária tem a Área do Cliente contratada. Isso é informação
 * comercial — vai para quem é membro dela, não para todo visitante do site.
 *
 * ⚠️ NÃO é controle de acesso, e a distinção importa. Quem fecha o portal para
 * o cliente final é a RLS (`portal_my_parties()` lê `tenant_features`) e o
 * `requirePortalUser`. O que esta resposta faz é evitar que o painel ofereça
 * telas de um recurso que a imobiliária não tem — e um membro que digite a URL
 * direto continua vendo dados do PRÓPRIO tenant, nunca de outro.
 */
export default defineEventHandler(async (event) => {
  const { tenant } = await requireTenantMember(event)

  // Em paralelo, e numa resposta só: o middleware de rota espera esta chamada
  // antes de decidir o redirect, e uma requisição por recurso multiplicaria a
  // espera na primeira navegação do painel.
  const [areaCliente, quemSomos, descricaoIa, crm, cobranca] = await Promise.all([
    areaClienteAtiva(tenant.id),
    quemSomosAtiva(tenant.id),
    descricaoIaAtiva(tenant.id),
    crmAtivo(tenant.id),
    cobrancaAtiva(tenant.id),
  ])

  return { areaCliente, quemSomos, descricaoIa, crm, cobranca }
})
