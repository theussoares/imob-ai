import { injectAnalytics } from '@vercel/analytics/nuxt/runtime'
import { injectSpeedInsights } from '@vercel/speed-insights/nuxt/runtime'
import { isAdminHost } from '~~/shared/utils/admin-host'
import { filtrarEvento } from '~~/shared/utils/rastreio'

/**
 * Vercel Analytics e Speed Insights, com o filtro de privacidade.
 *
 * Substitui os módulos `@vercel/analytics` e `@vercel/speed-insights` do
 * nuxt.config: eles injetam sem opção nenhuma, e o `beforeSend` só entra por
 * aqui. O comportamento de carga é o mesmo dos módulos — o Analytics já espera o
 * `onNuxtReady` internamente, e os dois scripts vêm com `defer`. Adiar o Speed
 * Insights além disso foi descartado: o ganho é marginal e ele perderia a
 * janela de medir a interação logo após a hidratação, que é justamente o que o
 * INP mede.
 *
 * O clique no WhatsApp é um ouvinte só, no documento, e não um `@click` em cada
 * link: são oito lugares que montam `wa.me` (card, página do imóvel, barra fixa,
 * rodapé, menu...), e o próximo que aparecer entra sem ninguém lembrar de
 * instrumentá-lo.
 */
export default defineNuxtPlugin(() => {
  // No host do painel nem carrega: todo evento dali seria descartado pelo
  // `beforeSend`, e baixar o script para descartar tudo é custo sem retorno.
  if (isAdminHost(window.location.hostname)) return

  injectAnalytics({ beforeSend: filtrarEvento })
  injectSpeedInsights({ beforeSend: filtrarEvento })

  const { rastrear } = useRastreio()
  document.addEventListener(
    'click',
    (e) => {
      const link = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (link && /^https:\/\/(wa\.me|api\.whatsapp\.com)\//.test(link.href)) rastrear('whatsapp_clique')
    },
    // Captura: o link abre em nova aba e alguns cards param a propagação do
    // clique (o carrossel trata o toque) — na fase de captura o evento chega
    // antes disso.
    { capture: true },
  )
})
