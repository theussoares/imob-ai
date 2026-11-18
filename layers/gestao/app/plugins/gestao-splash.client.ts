/**
 * Remove o esqueleto do HTML (`server/utils/gestao-splash.ts`) quando a tela real terminou de
 * montar. `app:suspense:resolve` é o momento em que layout + página já resolveram seus `await`
 * (inclusive o `store.carregar()`); sem isso o esqueleto sairia no `mounted` e a tela piscaria branca.
 * O temporizador de segurança evita que uma falha deixe o esqueleto cobrindo o painel para sempre.
 */
export default defineNuxtPlugin((nuxtApp) => {
  const tirar = () => {
    const el = document.querySelector<HTMLElement>('.gestao-splash')
    if (!el) return
    el.style.transition = 'opacity .2s'
    el.style.opacity = '0'
    setTimeout(() => el.remove(), 220)
  }
  nuxtApp.hook('app:suspense:resolve', tirar)
  setTimeout(tirar, 15000)
})
