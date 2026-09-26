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

/**
 * Um número em destaque, UM por bloco — formato antigo.
 *
 * Continua lido (há páginas salvas assim) e renderizado igual a `stats`, porque
 * a página agrupa números consecutivos numa faixa só. Não é mais oferecido na
 * paleta: três números eram três blocos, três pares de setas, e o agrupamento
 * implícito confundia quem editava. Ver `AboutStatsBlock`.
 */
export interface AboutStatBlock {
  type: 'stat'
  value: string
  label: string
}

export interface AboutStatItem {
  value: string
  label: string
}

/** Faixa de números — "18 anos · 1.200 famílias · 3 cidades" — num bloco só. */
export interface AboutStatsBlock {
  type: 'stats'
  items: AboutStatItem[]
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

/** Depoimento de cliente, UM por bloco — formato antigo; ver `AboutStatBlock`. */
export interface AboutTestimonialBlock {
  type: 'testimonial'
  quote: string
  authorName: string
  authorRole: string
}

export interface AboutTestimonialItem {
  quote: string
  authorName: string
  /** O que dá credibilidade: o que a pessoa fez, onde e quando. */
  authorRole: string
}

/** Grade de depoimentos de clientes — prova social. */
export interface AboutTestimonialsBlock {
  type: 'testimonials'
  items: AboutTestimonialItem[]
}

export interface AboutValueItem {
  title: string
  body: string
}

/**
 * "Como trabalhamos": compromissos concretos, com título curto e uma frase.
 *
 * Existe para substituir o parágrafo de "missão, visão e valores" que ninguém
 * lê por algo que o cliente consegue conferir — "Visita no mesmo dia",
 * "Contrato revisado por advogado".
 */
export interface AboutValuesBlock {
  type: 'values'
  /** Vazio cai no padrão ("Como trabalhamos") na renderização. */
  title: string
  items: AboutValueItem[]
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
  | AboutStatsBlock
  | AboutBannerBlock
  | AboutSplitBlock
  | AboutGalleryBlock
  | AboutTestimonialBlock
  | AboutTestimonialsBlock
  | AboutValuesBlock
  | AboutLogosBlock
  | AboutTeamBlock

export type AboutBlockType = AboutBlock['type']

// A ordem aqui é a da paleta do painel: do que toda página precisa (texto,
// história, números) para o acabamento (selos). Os dois tipos antigos ficam no
// fim, fora da paleta — ver `ABOUT_BLOCK_TYPES_OFERECIDOS`.
export const ABOUT_BLOCK_TYPE_LABELS: Record<AboutBlockType, string> = {
  heading: 'Título de seção',
  text: 'Texto',
  split: 'Texto + imagem lado a lado',
  stats: 'Números em destaque',
  values: 'Como trabalhamos',
  team: 'Equipe de corretores',
  testimonials: 'Depoimentos',
  image: 'Imagem',
  banner: 'Banner (imagem de fundo + chamada)',
  gallery: 'Galeria de imagens',
  logos: 'Logos/selos de parceiros',
  stat: 'Número em destaque (formato antigo)',
  testimonial: 'Depoimento (formato antigo)',
}

export const ABOUT_BLOCK_TYPES = Object.keys(ABOUT_BLOCK_TYPE_LABELS) as AboutBlockType[]

/** Tipos lidos mas não mais criados: a paleta oferece `stats` e `testimonials`. */
export const ABOUT_BLOCK_TYPES_LEGADOS: readonly AboutBlockType[] = ['stat', 'testimonial']
export const ABOUT_BLOCK_TYPES_OFERECIDOS = ABOUT_BLOCK_TYPES.filter((t) => !ABOUT_BLOCK_TYPES_LEGADOS.includes(t))

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
    // Com itens: já nascem com as linhas que a pessoa provavelmente vai
    // preencher, para ela ver a forma do bloco sem ter de clicar "+ item" antes.
    case 'stats':
      return { type: 'stats', items: [0, 1, 2].map(() => ({ value: '', label: '' })) }
    case 'testimonials':
      return { type: 'testimonials', items: [{ quote: '', authorName: '', authorRole: '' }] }
    case 'values':
      return { type: 'values', title: '', items: [0, 1, 2].map(() => ({ title: '', body: '' })) }
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

/**
 * Uma linha de "para que serve" por tipo, para a paleta de blocos do painel.
 *
 * O `<select>` só com o nome do tipo obrigava a pessoa a adivinhar como cada
 * bloco fica e quando usá-lo. Aqui mora o critério, não a descrição visual —
 * a miniatura da paleta mostra a forma.
 */
export const ABOUT_BLOCK_TYPE_PURPOSE: Record<AboutBlockType, string> = {
  heading: 'Abre uma seção nova da página.',
  text: 'Parágrafo corrido: a história, como vocês trabalham.',
  image: 'Uma foto grande, com legenda opcional.',
  stat: 'Um número concreto — "18 anos", "1.200 famílias".',
  stats: 'Até 4 números concretos numa faixa — "18 anos", "1.200 famílias".',
  values: 'Até 4 compromissos que o cliente consegue conferir.',
  testimonials: 'Até 6 falas de clientes, com o que cada um fez.',
  banner: 'Faixa com foto de fundo, frase de impacto e botão.',
  split: 'Texto ao lado de uma foto real — ideal para a história.',
  gallery: 'Carrossel de fotos do escritório e da equipe.',
  testimonial: 'Fala de um cliente, com nome e o que ele fez.',
  logos: 'Selos, certificações e portais parceiros.',
  team: 'Os corretores marcados como públicos, sempre atualizados.',
}

/** Um bloco do modelo recomendado, com a dica do que escrever nele. */
export interface AboutTemplateBlock {
  block: AboutBlock
  hint: string
}

/**
 * Estrutura recomendada para a página: credibilidade → prova → contato
 * (o contato é a moldura fixa do site, não entra aqui).
 *
 * Os blocos saem VAZIOS de propósito. Texto-exemplo ("Fundada em 2005 por...")
 * esquecido no lugar vira conteúdo falso publicado no site do cliente; bloco
 * vazio é descartado pelo sanitizador e simplesmente não aparece. A orientação
 * vai na dica, que existe só no painel.
 *
 * Função, e não constante: cada chamada precisa de objetos novos, senão dois
 * cliques no botão inseririam os MESMOS blocos duas vezes, editados juntos.
 */
export function recommendedAboutBlocks(): AboutTemplateBlock[] {
  return [
    {
      block: emptyAboutBlock('stats'),
      hint: 'Números em destaque: há quanto tempo vocês atuam, quantas famílias atenderam, em quantas cidades. Número concreto convence mais que adjetivo.',
    },
    {
      block: emptyAboutBlock('split'),
      hint: 'Nossa história: por que a imobiliária começou e para quem ela existe. Use uma foto real do fundador ou da sede, não de banco de imagem.',
    },
    {
      block: emptyAboutBlock('values'),
      hint: 'Como trabalhamos: 3 ou 4 compromissos que o cliente consegue conferir — "Visita no mesmo dia", "Contrato revisado por advogado". Evite "missão, visão e valores".',
    },
    { block: emptyAboutBlock('team'), hint: 'A equipe entra sozinha, a partir da tela Corretores.' },
    {
      block: emptyAboutBlock('testimonials'),
      hint: 'Depoimentos com contexto: no complemento, diga o que o cliente fez (comprou, vendeu, alugou), o bairro e o ano.',
    },
    { block: emptyAboutBlock('logos'), hint: 'Selos, certificações e portais onde vocês anunciam.' },
  ]
}
