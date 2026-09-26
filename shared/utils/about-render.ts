import type {
  AboutBlock,
  AboutStatItem,
  AboutTestimonialItem,
} from '~~/shared/models/about-page'

type BlocoComLista = Extract<AboutBlock, { type: 'stat' | 'stats' | 'testimonial' | 'testimonials' }>

export type AboutRenderGroup =
  | { kind: 'stats'; items: AboutStatItem[] }
  | { kind: 'testimonials'; items: AboutTestimonialItem[] }
  | { kind: 'block'; block: Exclude<AboutBlock, BlocoComLista> }

/**
 * Converte a lista salva nos grupos que a página desenha.
 *
 * Números e depoimentos existem em dois formatos: o antigo, um item por bloco
 * (`stat`, `testimonial`), e o atual, um bloco com itens (`stats`,
 * `testimonials`). Os dois viram o MESMO grupo aqui, e é por isso que página
 * salva no formato antigo continua igual sem migração de dado nenhuma.
 *
 * Bloco antigo se junta ao grupo anterior do mesmo tipo — era assim que três
 * `stat` seguidos viravam uma fileira. Bloco novo sempre abre grupo próprio:
 * dois blocos de números separados de propósito continuam separados.
 */
export function groupAboutBlocks(blocks: AboutBlock[]): AboutRenderGroup[] {
  const out: AboutRenderGroup[] = []
  for (const b of blocks) {
    const last = out[out.length - 1]
    switch (b.type) {
      case 'stat':
        if (last?.kind === 'stats') last.items.push({ value: b.value, label: b.label })
        else out.push({ kind: 'stats', items: [{ value: b.value, label: b.label }] })
        break
      case 'testimonial': {
        const item = { quote: b.quote, authorName: b.authorName, authorRole: b.authorRole }
        if (last?.kind === 'testimonials') last.items.push(item)
        else out.push({ kind: 'testimonials', items: [item] })
        break
      }
      case 'stats':
        out.push({ kind: 'stats', items: [...b.items] })
        break
      case 'testimonials':
        out.push({ kind: 'testimonials', items: [...b.items] })
        break
      default:
        out.push({ kind: 'block', block: b })
    }
  }
  return out
}
