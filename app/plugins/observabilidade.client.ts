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
      if (!link || !/^https:\/\/(wa\.me|api\.whatsapp\.com)\//.test(link.href)) return
      rastrear('whatsapp_clique')
      registrarCliqueWhatsapp(link)
    },
    // Captura: o link abre em nova aba e alguns cards param a propagação do
    // clique (o carrossel trata o toque) — na fase de captura o evento chega
    // antes disso.
    { capture: true },
  )
})

/**
 * Manda o clique para o painel da imobiliária (`/api/whatsapp-clicks`).
 *
 * `sendBeacon`, e não `fetch`: o link abre o app do WhatsApp ou outra aba, e um
 * `fetch` em voo é cancelado quando a página perde o foco ou é descarregada —
 * justamente no celular, onde está quase todo o tráfego. O beacon é entregue
 * pelo navegador mesmo depois disso.
 *
 * O imóvel vem de `data-imovel`, posto nos três botões que são de um imóvel
 * (card, barra fixa, página). Ler o código de dentro do texto do `wa.me` seria
 * depender da frase de `useContact`, que alguém vai reescrever um dia.
 *
 * Nada de destino: para qual número a conversa foi, o servidor calcula.
 */
function registrarCliqueWhatsapp(link: HTMLAnchorElement) {
  // O painel também tem botão de WhatsApp — o do atendente respondendo o lead.
  // No host `painel.` este plugin nem roda; o prefixo cobre o `/admin` servido
  // no mesmo host do site (dev, `?tenant=`), onde o clique do corretor viraria
  // "visitante chamou no WhatsApp".
  if (/^\/(admin|area-cliente)(\/|$)/.test(window.location.pathname)) return
  try {
    const corpo = JSON.stringify({
      propertyCode: link.dataset.imovel || null,
      origin: link.dataset.waOrigem || 'site',
    })
    navigator.sendBeacon?.('/api/whatsapp-clicks', new Blob([corpo], { type: 'application/json' }))
  } catch {
    // Registro é bônus: nunca pode atrapalhar o visitante de abrir a conversa.
  }
}
