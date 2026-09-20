import { getHostname, isAdminHost } from '~~/server/utils/tenant'

/**
 * Declara o manifest só nas páginas servidas em host de painel.
 *
 * Precisa ser condicional por host, e não global em `app.head`: o mesmo app
 * serve o site público dos clientes, e lá o `<link rel="manifest">` apontaria
 * para uma rota que responde 404 de propósito — erro no console de toda página
 * de todo cliente, além de convidar o navegador a oferecer a instalação de um
 * site que não é para ser instalado.
 *
 * Feito aqui, no `render:html`, e não com `useHead` no layout do painel, por
 * dois motivos: o link já sai no HTML inicial (o navegador avalia
 * instalabilidade cedo, e o painel é SPA — o head do cliente só existe depois
 * da hidratação), e assim dá para conferir com `curl` que ele aparece no host
 * certo e some no errado.
 */
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('render:html', (html, { event }) => {
    if (!isAdminHost(getHostname(event))) return
    html.head.push('<link rel="manifest" href="/manifest.webmanifest">')
  })
})
