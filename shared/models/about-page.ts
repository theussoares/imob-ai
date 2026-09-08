/**
 * Blocos de conteúdo da página "Quem somos".
 *
 * Registro de tipos, no mesmo espírito de property-type.ts: cada tipo de bloco
 * declara seus campos e o rótulo que aparece no seletor do painel, e o resto
 * (união de tipos, lista para o `<select>`) deriva daqui.
 *
 * A maioria é conteúdo ESTÁTICO — o que a pessoa digita fica exatamente como
 * digitou. `team` é diferente: é um bloco DINÂMICO, sem texto para editar aqui
 * — ele manda a página buscar ao vivo os corretores que optaram por aparecer
 * (tela Corretores → "Mostrar no site"). Existe separado de `image`/`gallery`
 * de propósito: o conteúdo não mora no JSONB da página, mora no cadastro de
 * corretores, e a página só aponta pra lá — trocar de agência ou desligar um
 * corretor atualiza a vitrine sem tocar em "Quem somos".
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

/** Faixa de largura total com imagem de fundo, título e um botão opcional. */
export interface AboutBannerBlock {
  type: 'banner'
  title: string
  imageUrl: string
  ctaLabel: string
  ctaHref: string
}

/** Texto e imagem lado a lado — o formato clássico de "nossa história". */
export interface AboutSplitBlock {
  type: 'split'
  imageUrl: string
  imageAlt: string
  title: string
  body: string
  imagePosition: 'left' | 'right'
}

export interface AboutGalleryImage {
  url: string
  alt: string
}

/** Carrossel manual de fotos (escritório, eventos, bastidores). */
export interface AboutGalleryBlock {
  type: 'gallery'
  images: AboutGalleryImage[]
}

/** Depoimento de cliente — prova social. */
export interface AboutTestimonialBlock {
  type: 'testimonial'
  quote: string
  authorName: string
  authorRole: string
}

export interface AboutLogoItem {
  url: string
  alt: string
}

/** Fileira de selos/logos de parceiros (portais, certificações). */
export interface AboutLogosBlock {
  type: 'logos'
  items: AboutLogoItem[]
}

/** Bloco dinâmico: carrossel dos corretores marcados como públicos. */
export interface AboutTeamBlock {
  type: 'team'
  /** Título da seção. Vazio cai no padrão ("Nossa equipe") na renderização. */
  title: string
}

export type AboutBlock =
  | AboutHeadingBlock
  | AboutTextBlock
  | AboutImageBlock
  | AboutStatBlock
  | AboutBannerBlock
  | AboutSplitBlock
  | AboutGalleryBlock
  | AboutTestimonialBlock
  | AboutLogosBlock
  | AboutTeamBlock

export type AboutBlockType = AboutBlock['type']

export const ABOUT_BLOCK_TYPE_LABELS: Record<AboutBlockType, string> = {
  heading: 'Título de seção',
  text: 'Texto',
  image: 'Imagem',
  stat: 'Número em destaque',
  banner: 'Banner (imagem de fundo + chamada)',
  split: 'Texto + imagem lado a lado',
  gallery: 'Galeria de imagens',
  testimonial: 'Depoimento',
  logos: 'Logos/selos de parceiros',
  team: 'Carrossel de corretores',
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
    case 'banner':
      return { type: 'banner', title: '', imageUrl: '', ctaLabel: '', ctaHref: '' }
    case 'split':
      return { type: 'split', imageUrl: '', imageAlt: '', title: '', body: '', imagePosition: 'right' }
    case 'gallery':
      return { type: 'gallery', images: [] }
    case 'testimonial':
      return { type: 'testimonial', quote: '', authorName: '', authorRole: '' }
    case 'logos':
      return { type: 'logos', items: [] }
    case 'team':
      return { type: 'team', title: '' }
  }
}

export interface AboutPageContent {
  blocks: AboutBlock[]
}

export const EMPTY_ABOUT_CONTENT: AboutPageContent = { blocks: [] }
