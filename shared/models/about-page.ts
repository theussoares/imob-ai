/**
 * Blocos de conteúdo da página "Quem somos".
 *
 * Registro de tipos, no mesmo espírito de property-type.ts: cada tipo de bloco
 * declara seus campos e o rótulo que aparece no seletor do painel, e o resto
 * (união de tipos, lista para o `<select>`) deriva daqui.
 *
 * Só quatro tipos hoje — o suficiente para começar a estruturar a página antes
 * dos modelos de conteúdo definitivos chegarem. Adicionar um tipo novo (linha
 * do tempo, depoimento, equipe) é estender a união e o `switch` de
 * renderização; nada disso quebra os blocos já salvos, porque cada um carrega
 * o próprio `type`.
 */

export interface AboutHeadingBlock {
  type: 'heading'
  text: string
}

export interface AboutTextBlock {
  type: 'text'
  body: string
}

export interface AboutImageBlock {
  type: 'image'
  url: string
  alt: string
  caption: string
}

/** Um número em destaque, tipo "20 anos de mercado" ou "500+ imóveis vendidos". */
export interface AboutStatBlock {
  type: 'stat'
  value: string
  label: string
}

export type AboutBlock = AboutHeadingBlock | AboutTextBlock | AboutImageBlock | AboutStatBlock

export type AboutBlockType = AboutBlock['type']

export const ABOUT_BLOCK_TYPE_LABELS: Record<AboutBlockType, string> = {
  heading: 'Título de seção',
  text: 'Texto',
  image: 'Imagem',
  stat: 'Número em destaque',
}

export const ABOUT_BLOCK_TYPES = Object.keys(ABOUT_BLOCK_TYPE_LABELS) as AboutBlockType[]

/** Bloco em branco de um tipo, pronto para entrar na lista e ser preenchido. */
export function emptyAboutBlock(type: AboutBlockType): AboutBlock {
  switch (type) {
    case 'heading':
      return { type: 'heading', text: '' }
    case 'text':
      return { type: 'text', body: '' }
    case 'image':
      return { type: 'image', url: '', alt: '', caption: '' }
    case 'stat':
      return { type: 'stat', value: '', label: '' }
  }
}

export interface AboutPageContent {
  blocks: AboutBlock[]
}

export const EMPTY_ABOUT_CONTENT: AboutPageContent = { blocks: [] }
