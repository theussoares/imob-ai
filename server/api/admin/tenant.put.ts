import type { TenantSettingsInput } from '~~/shared/models/tenant'
import { updateTenantSettings } from '~~/server/repositories/tenant.repository'
import { areaClienteAtiva, quemSomosAtiva } from '~~/server/utils/entitlement'

/** Salva as configurações da imobiliária (branding, contato, textos). */
export default defineEventHandler(async (event) => {
  const { client, tenant, user } = await requireTenantMember(event)
  const body = await readBody<TenantSettingsInput>(event)
  assertTenantSettingsInput(body)

  // `portalEnabled` só é gravável por quem tem a Área do Cliente.
  //
  // Esconder a seção em `/admin/config` não bastava, e a revisão do PR #27
  // mostrou os dois caminhos que passavam por cima dela:
  //   - a tela manda TODOS os campos que declara a cada salvamento, então
  //     salvar uma cor da marca reenviava `portalEnabled` da seção escondida;
  //   - um PUT direto aqui aceitava o campo de qualquer membro.
  //
  // Descartar em vez de recusar com erro é deliberado: quem está salvando quis
  // mudar OUTRA coisa, e derrubar o salvamento inteiro por um campo que a tela
  // nem mostra seria punir a pessoa por um detalhe do cliente. O valor antigo
  // fica intacto — é o que faz a escolha dela voltar quando o recurso voltar.
  //
  // Vale igual para `aboutEnabled`, e pelo mesmo motivo: `/admin/config` e
  // `/admin/site` também mandam o formulário inteiro a cada salvamento.
  const [temPortal, temQuemSomos] = await Promise.all([
    areaClienteAtiva(tenant.id),
    quemSomosAtiva(tenant.id),
  ])

  if (body.portalEnabled !== undefined && !temPortal) {
    logWarn('tenant.portal_enabled_ignorado', { tenant: tenant.slug, motivo: 'sem_recurso' })
    delete body.portalEnabled
  }

  if (body.aboutEnabled !== undefined && !temQuemSomos) {
    logWarn('tenant.about_enabled_ignorado', { tenant: tenant.slug, motivo: 'sem_recurso' })
    delete body.aboutEnabled
  }

  const updated = await updateTenantSettings(client, tenant.id, body, user.id)
  await invalidateTenantCache(tenant.id)
  clearTenantHostCache()

  // Devolve o mesmo valor EFETIVO que `/api/tenant` devolve — o repositório
  // mapeia a coluna crua. A tela guarda esta resposta no estado do tenant, e
  // duas definições de `portalEnabled` no mesmo app divergiriam até o F5.
  return {
    ...updated,
    portalEnabled: updated.portalEnabled && temPortal,
    aboutEnabled: updated.aboutEnabled && temQuemSomos,
  }
})
