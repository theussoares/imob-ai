import { getPrimaryDomain } from '~~/server/repositories/tenant.repository'
import { canonicalHostFor } from '~~/server/utils/canonical-host'

/**
 * Redireciona para o endereço oficial da imobiliária quando ela tem um.
 *
 * Sem isto o site fica no ar em dois endereços — o domínio próprio e o
 * subdomínio antigo da plataforma —, cada um se declarando canônico, e o Google
 * divide entre os dois os links e a reputação que deveriam se somar.
 *
 * Nome com `00-` para ordenar antes de `00-legacy-urls`: quem chega pelo host
 * antigo E pela URL antiga leva um 301 de host e outro de caminho, em vez de
 * cair numa URL velha já no domínio novo.
 */
export default defineEventHandler(async (event) => {
  // 301 em POST mudaria o método da requisição no caminho. Só leitura.
  if (event.method !== 'GET' && event.method !== 'HEAD') return

  const hostname = getHostname(event)

  /**
   * NUNCA redirecionar o painel.
   *
   * A sessão vive em `localStorage` sob `imob-admin-auth`, que é por origem:
   * mandar `painel.antigo` para `painel.novo` deslogaria a pessoa no meio do
   * trabalho, sem explicação na tela. Já houve um incidente desse tipo com uma
   * cliente, e a causa levou tempo para ser achada. O painel também não é
   * indexado, então não há nada a consolidar aqui.
   */
  if (isAdminHost(hostname)) return

  // Domínio-raiz da plataforma não é de tenant nenhum.
  if (isPlatformRootHost(hostname)) return

  /**
   * Só em produção.
   *
   * `localhost` e `127.0.0.1` estão cadastrados como domínios do tenant
   * `tres-lagoas`, que TEM domínio próprio — então em desenvolvimento este
   * middleware mandaria a máquina local para o site em produção e tornaria o
   * projeto impossível de rodar. `allowTenantSwitch` é o sinal que o projeto já
   * usa para "não é produção" (VERCEL_ENV !== 'production').
   */
  if (useRuntimeConfig().public.allowTenantSwitch) return

  const tenant = event.context.tenant ?? (await resolveTenantForHost(hostname))
  if (!tenant) return

  const primary = await cached(tenantCacheKey(tenant.id, 'primary-domain'), () =>
    getPrimaryDomain(publicSupabase(), tenant.id),
  )
  const destino = canonicalHostFor(hostname, primary)
  if (!destino) return

  // Caminho e query vão junto: perder a query aqui descartaria `fbclid`/`gclid`
  // de quem chegou por rede social ou anúncio, que é justamente quem mais usa o
  // endereço antigo divulgado.
  const url = getRequestURL(event, { xForwardedHost: true, xForwardedProto: true })
  return sendRedirect(event, `https://${destino}${url.pathname}${url.search}`, 301)
})
