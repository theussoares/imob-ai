/**
 * URL do site público a partir do host do painel.
 *
 * O admin roda em host próprio (`painel.<domínio>` ou `admin.<domínio>`), que
 * só serve o admin — qualquer rota não-`/admin` nesse host é redirecionada de
 * volta pra `/admin` (ver server/middleware/admin-host.ts). Um link relativo
 * (`href="/"`) resolveria pra raiz DESSE host, caindo de novo no painel; por
 * isso o link pro site precisa do host do TENANT, sem o prefixo do painel.
 *
 * Client-only: o admin é SPA (`ssr: false`), sem `window` no servidor.
 */
export function usePublicSiteUrl() {
  const url = ref('/')
  onMounted(() => {
    const host = window.location.host.replace(/^(painel|admin)\./, '')
    url.value = `${window.location.protocol}//${host}/`
  })
  return url
}
