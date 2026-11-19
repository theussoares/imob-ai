/**
 * Controla a saída da abertura/esqueleto do HTML (`server/utils/gestao-splash.ts`).
 *
 * - Espera a animação dos prédios terminar (2,7 s desde a abertura da página) antes de mostrar o
 *   painel, mesmo que ele fique pronto antes: a abertura é parte do produto, e cortá-la no meio
 *   pareceria um defeito.
 * - Sai quando a tela real terminou de montar (`app:suspense:resolve`: layout + página já resolveram
 *   seus `await`, inclusive o `store.carregar()`) ou quando o Nuxt mostra a tela de erro (`app:error`).
 * - NÃO há temporizador de desistência: se o painel não ficar pronto, o esqueleto permanece (e,
 *   passados 20 s, o próprio HTML mostra "Não foi possível carregar"). Tirar o esqueleto à força
 *   deixaria a tela branca, que é justamente o que ele existe para evitar.
 */
// Menor que o 3 s em que o CSS da abertura cede ao esqueleto (`gs-intro-sai`): com o painel pronto,
// a abertura sai direto para ele e o esqueleto nem chega a aparecer.
const DURACAO_ABERTURA_MS = 2700

export default defineNuxtPlugin((nuxtApp) => {
  let tirando = false
  const tirar = () => {
    if (tirando) return
    tirando = true
    const sair = () => {
      const el = document.querySelector<HTMLElement>('.gestao-splash')
      if (!el) return
      // O painel real sobe suavemente enquanto o esqueleto some: sem corte entre um e outro.
      document.getElementById('__nuxt')?.classList.add('gestao-entrando')
      el.style.transition = 'opacity .25s'
      el.style.opacity = '0'
      setTimeout(() => el.remove(), 260)
    }
    // `performance.now()` conta desde o início da navegação, que é quando a abertura começou.
    setTimeout(sair, Math.max(0, DURACAO_ABERTURA_MS - performance.now()))
  }
  nuxtApp.hook('app:suspense:resolve', tirar)
  nuxtApp.hook('app:error', tirar)
})
