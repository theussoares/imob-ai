import type { Property } from '~~/shared/models/property'
import { propertyPath } from '~~/shared/utils/property-url'

/**
 * WebMCP (progressive enhancement): expõe ferramentas do site a agentes de IA
 * no navegador via navigator.modelContext. É totalmente feature-detected —
 * não faz nada em navegadores sem suporte.
 */
export default defineNuxtPlugin(() => {
  const nav = navigator as unknown as {
    modelContext?: { provideContext?: (ctx: unknown) => void }
  }
  if (!nav?.modelContext?.provideContext) return

  const brl = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

  try {
    nav.modelContext.provideContext({
      tools: [
        {
          name: 'buscar_imoveis',
          description:
            'Busca imóveis à venda ou para alugar publicados neste site imobiliário, com filtros opcionais.',
          inputSchema: {
            type: 'object',
            properties: {
              pretensao: { type: 'string', enum: ['venda', 'aluguel'], description: 'venda ou aluguel' },
              tipo: {
                type: 'string',
                enum: ['casa', 'apartamento', 'sobrado', 'terreno'],
              },
              texto: { type: 'string', description: 'bairro, cidade ou palavra-chave' },
              quartosMin: { type: 'number' },
              precoMax: { type: 'number' },
            },
          },
          async execute(args: Record<string, unknown> = {}) {
            const all = await $fetch<Property[]>('/api/properties')
            let list = all
            if (args.pretensao) list = list.filter((p) => p.purpose === args.pretensao)
            if (args.tipo) list = list.filter((p) => p.type === args.tipo)
            if (typeof args.quartosMin === 'number') list = list.filter((p) => p.bedrooms >= (args.quartosMin as number))
            if (typeof args.precoMax === 'number') list = list.filter((p) => p.price <= (args.precoMax as number))
            if (args.texto) {
              const t = String(args.texto).toLowerCase()
              list = list.filter((p) =>
                `${p.neighborhood ?? ''} ${p.city ?? ''} ${p.title} ${p.code}`.toLowerCase().includes(t),
              )
            }
            const origin = location.origin
            const text = list.length
              ? list
                  .slice(0, 20)
                  .map(
                    (p) =>
                      `- ${p.title} (${p.code}) — ${brl(p.price)}${p.purpose === 'aluguel' ? '/mês' : ''} · ` +
                      `${p.neighborhood ?? ''}, ${p.city ?? ''} · ${origin}${propertyPath(p)}`,
                  )
                  .join('\n')
              : 'Nenhum imóvel encontrado com esses filtros.'
            return { content: [{ type: 'text', text: `${list.length} imóvel(is) encontrado(s):\n${text}` }] }
          },
        },
      ],
    })
  } catch {
    // silencioso: WebMCP é opcional
  }
})
