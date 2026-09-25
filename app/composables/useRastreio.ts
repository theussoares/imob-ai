// Do pacote base, e não de `@vercel/analytics/nuxt/runtime` como o plugin:
// aquele arquivo importa `#app`, e este composable entra no SSR (pelo
// LeadForm). Fora de `modules`, o Nuxt não transpila o pacote e, em dev, o Vite
// entrega o import ao Node, que não resolve `#app` — a home do tenant e a
// página do imóvel davam 500. O `track` é a mesma função nos dois: só enfileira
// em `window.va`, e o `beforeSend` do plugin continua filtrando. `build.transpile`
// também resolveria, mas é uma regra de config longe do sintoma, que ninguém
// vai associar a este import quando mudar.
import { track } from '@vercel/analytics'

/**
 * Eventos de negócio no Vercel Analytics: lead enviado e clique no WhatsApp.
 *
 * A página vai como PADRÃO de rota (`/:slug/:codigo`), nunca como caminho real:
 * o caminho entrega qual imóvel a pessoa olhava, e o padrão basta para saber de
 * onde vem a conversão. Nenhum dado do formulário entra aqui — nome e telefone
 * vão para o servidor da imobiliária (`/api/leads`), não para a Vercel.
 *
 * O filtro de `/admin` e `/area-cliente` vale também para estes eventos: passa
 * pelo mesmo `beforeSend` (ver `shared/utils/rastreio.ts`).
 *
 * ⚠️ Evento customizado só é registrado nos planos Pro e Enterprise da Vercel.
 * No Hobby a chamada não quebra nada — só não aparece no painel.
 */
export type EventoDeNegocio = 'lead_enviado' | 'whatsapp_clique'

export function useRastreio() {
  const route = useRoute()
  function rastrear(evento: EventoDeNegocio, props: Record<string, string | number | boolean> = {}) {
    if (import.meta.server) return
    const pagina = route.matched.at(-1)?.path ?? route.path
    track(evento, { pagina, ...props })
  }
  return { rastrear }
}
