import { GESTAO_SPLASH_HTML } from '~~/server/utils/gestao-splash'

/** Injeta o esqueleto do painel no HTML das rotas /gestao (ver `gestao-splash.ts`). */
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('render:html', (html, { event }) => {
    const caminho = event.path.split('?')[0] ?? ''
    if (caminho === '/gestao' || caminho.startsWith('/gestao/')) html.bodyPrepend.push(GESTAO_SPLASH_HTML)
  })
})
