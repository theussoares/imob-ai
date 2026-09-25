import { track } from '@vercel/analytics/nuxt/runtime'

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
