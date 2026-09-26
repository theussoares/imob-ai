import type { AboutBlock } from '~~/shared/models/about-page'
import { sanitizeAboutContent } from '~~/shared/utils/about-content'

export interface AboutChecklistItem {
  key: 'historia' | 'numeros' | 'equipe' | 'depoimento' | 'descricoes'
  ok: boolean
  /** O que aparece na lista — afirmativo quando `ok`, a pendência quando não. */
  label: string
}

/** Imagens de um bloco que o visitante vê como foto (o fundo do banner é decoração). */
function imagensDoBloco(b: AboutBlock): { url: string; alt: string }[] {
  switch (b.type) {
    case 'image':
      return [{ url: b.url, alt: b.alt }]
    case 'split':
      return b.imageUrl ? [{ url: b.imageUrl, alt: b.imageAlt }] : []
    case 'gallery':
      return b.images
    case 'logos':
      return b.items
    default:
      return []
  }
}

/**
 * Checklist ao lado do interruptor de publicar: o que uma página de confiança
 * costuma ter, e o que falta nesta.
 *
 * ORIENTA, não bloqueia — o único bloqueio é o mínimo de `aboutTemConteudoMinimo`.
 * Uma imobiliária de dois sócios sem depoimento ainda pode ter uma boa página;
 * travar a publicação por isso empurraria a pessoa a inventar um.
 *
 * Avalia o conteúdo SANITIZADO, o que o site vai mostrar: bloco de depoimento
 * sem nome é descartado lá, então contá-lo aqui marcaria ✓ num item ausente.
 *
 * `corretoresPublicos` é `null` enquanto a contagem carrega: aí o item de equipe
 * olha só se o bloco existe, em vez de acusar "nenhum corretor" por um instante.
 * Existe porque o bloco de equipe sem corretor público some do site sem aviso.
 */
export function aboutChecklist(content: unknown, corretoresPublicos: number | null): AboutChecklistItem[] {
  const blocks = sanitizeAboutContent(content).blocks
  const tem = (t: AboutBlock['type']) => blocks.some((b) => b.type === t)

  const historia = blocks.some((b) => b.type === 'text' || (b.type === 'split' && !!b.body))
  const temEquipe = tem('team')
  const equipeOk = temEquipe && corretoresPublicos !== 0
  const semDescricao = blocks.flatMap(imagensDoBloco).filter((img) => !img.alt).length

  return [
    {
      key: 'historia',
      ok: historia,
      label: historia ? 'Tem texto contando quem vocês são' : 'Falta um texto contando quem vocês são',
    },
    {
      key: 'numeros',
      ok: tem('stat'),
      label: tem('stat') ? 'Tem números em destaque' : 'Sem números em destaque (anos, famílias atendidas)',
    },
    {
      key: 'equipe',
      ok: equipeOk,
      label: !temEquipe
        ? 'Sem o bloco de equipe'
        : corretoresPublicos === 0
          ? 'O bloco de equipe está vazio: nenhum corretor marcado para aparecer no site'
          : 'Equipe aparece com os corretores públicos',
    },
    {
      key: 'depoimento',
      ok: tem('testimonial'),
      label: tem('testimonial') ? 'Tem depoimento de cliente' : 'Sem depoimento de cliente',
    },
    {
      key: 'descricoes',
      ok: semDescricao === 0,
      label:
        semDescricao === 0
          ? 'Todas as imagens têm descrição'
          : `${semDescricao} ${semDescricao === 1 ? 'imagem sem descrição' : 'imagens sem descrição'} (texto alternativo)`,
    },
  ]
}
