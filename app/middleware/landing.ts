/**
 * Põe o domínio-raiz da plataforma no layout `landing`; tenant fica no default.
 *
 * A decisão morava no `setup()` de `pages/index.vue`, via `setPageLayout`. No
 * SSR isso troca o layout depois que o `<NuxtLayout>` já começou a renderizar
 * — o Nuxt avisa (NUXT_E2007) e a hidratação da landing chegava com nós
 * divergentes. Em middleware de rota a troca acontece antes da renderização,
 * nos dois lados.
 *
 * No servidor não dá para ler `useState('platformRoot')`: quem o preenche é o
 * `app.vue`, cujo setup roda DEPOIS do middleware. A fonte é então o mesmo
 * `event.context.platformRoot` que o `server/middleware/tenant.ts` grava e o
 * `/api/tenant` repassa — e o estado já é preenchido aqui para a página não
 * depender da ordem. No client o estado chega pelo payload (primeira carga) ou
 * pelo `app.vue` (navegação), então basta lê-lo.
 */
export default defineNuxtRouteMiddleware(() => {
  const platformRoot = useState('platformRoot', () => false)
  if (import.meta.server) {
    platformRoot.value = !!useRequestEvent()?.context.platformRoot
  }
  if (platformRoot.value) setPageLayout('landing')
})
