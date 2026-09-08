import type { AboutBlock, AboutGalleryImage, AboutLogoItem, AboutPageContent } from '~~/shared/models/about-page'
import { ABOUT_BLOCK_TYPES } from '~~/shared/models/about-page'

/** Página é editada por vez, não é feed: teto generoso evita rolagem infinita no painel. */
export const ABOUT_BLOCKS_MAX = 30

/** Cada carrossel (galeria/logos) tem teto próprio, menor: são itens dentro de UM bloco. */
export const GALLERY_IMAGES_MAX = 12
export const LOGOS_MAX = 10

const HEADING_MAX = 80
const TEXT_MAX = 4000
const IMAGE_ALT_MAX = 160
const IMAGE_CAPTION_MAX = 160
const STAT_VALUE_MAX = 20
const STAT_LABEL_MAX = 80
const CTA_LABEL_MAX = 40
const TESTIMONIAL_QUOTE_MAX = 600
const TESTIMONIAL_NAME_MAX = 80
const TESTIMONIAL_ROLE_MAX = 80

function str(v: unknown, max: number): string {
  return String(v ?? '').trim().slice(0, max)
}

/** Só http(s): toda imagem do bloco vem de upload para o Storage, nunca um esquema executável. */
function httpUrl(v: unknown, max = 2048): string {
  const url = str(v, max)
  return /^https?:\/\//i.test(url) ? url : ''
}

/** Um item `{ url, alt }` de galeria ou de logos — mesma forma, teto de itens diferente. */
function sanitizeImageItems(value: unknown, max: number): { url: string; alt: string }[] {
  if (!Array.isArray(value)) return []
  const out: { url: string; alt: string }[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const url = httpUrl((item as Record<string, unknown>).url)
    if (!url) continue
    out.push({ url, alt: str((item as Record<string, unknown>).alt, IMAGE_ALT_MAX) })
    if (out.length === max) break
  }
  return out
}

/**
 * Normaliza um bloco vindo do banco (JSONB) ou do painel.
 *
 * `null` descarta o bloco em vez de recusar a página inteira — um bloco velho
 * de um tipo removido, ou gravado por SQL direto, some sozinho na próxima
 * leitura em vez de derrubar a tela.
 */
function sanitizeBlock(value: unknown): AboutBlock | null {
  if (!value || typeof value !== 'object') return null
  const b = value as Record<string, unknown>
  const type = b.type
  if (!ABOUT_BLOCK_TYPES.includes(type as AboutBlock['type'])) return null

  switch (type as AboutBlock['type']) {
    case 'heading': {
      const text = str(b.text, HEADING_MAX)
      return text ? { type: 'heading', text } : null
    }
    case 'text': {
      const body = str(b.body, TEXT_MAX)
      return body ? { type: 'text', body } : null
    }
    case 'image': {
      const url = httpUrl(b.url)
      return url ? { type: 'image', url, alt: str(b.alt, IMAGE_ALT_MAX), caption: str(b.caption, IMAGE_CAPTION_MAX) } : null
    }
    case 'stat': {
      const value = str(b.value, STAT_VALUE_MAX)
      const label = str(b.label, STAT_LABEL_MAX)
      return value && label ? { type: 'stat', value, label } : null
    }
    case 'banner': {
      const title = str(b.title, HEADING_MAX)
      const imageUrl = httpUrl(b.imageUrl)
      if (!title && !imageUrl) return null
      // Botão só existe com texto E link — metade preenchida vira um botão
      // vazio ou um clique que não leva a lugar nenhum.
      const ctaLabel = str(b.ctaLabel, CTA_LABEL_MAX)
      const ctaHref = str(b.ctaHref, 2048)
      const temCta = ctaLabel && (ctaHref.startsWith('/') || /^https?:\/\//i.test(ctaHref))
      return { type: 'banner', title, imageUrl, ctaLabel: temCta ? ctaLabel : '', ctaHref: temCta ? ctaHref : '' }
    }
    case 'split': {
      const imageUrl = httpUrl(b.imageUrl)
      const title = str(b.title, HEADING_MAX)
      const body = str(b.body, TEXT_MAX)
      if (!imageUrl && !title && !body) return null
      const imagePosition = b.imagePosition === 'left' ? 'left' : 'right'
      return { type: 'split', imageUrl, imageAlt: str(b.imageAlt, IMAGE_ALT_MAX), title, body, imagePosition }
    }
    case 'gallery': {
      const images = sanitizeImageItems(b.images, GALLERY_IMAGES_MAX)
      return images.length ? { type: 'gallery', images: images as AboutGalleryImage[] } : null
    }
    case 'testimonial': {
      const quote = str(b.quote, TESTIMONIAL_QUOTE_MAX)
      const authorName = str(b.authorName, TESTIMONIAL_NAME_MAX)
      if (!quote || !authorName) return null
      return { type: 'testimonial', quote, authorName, authorRole: str(b.authorRole, TESTIMONIAL_ROLE_MAX) }
    }
    case 'logos': {
      const items = sanitizeImageItems(b.items, LOGOS_MAX)
      return items.length ? { type: 'logos', items: items as AboutLogoItem[] } : null
    }
    case 'team': {
      // Sempre válido: não guarda conteúdo próprio, só aponta pro carrossel
      // dinâmico de corretores. Título vazio cai no padrão na renderização.
      return { type: 'team', title: str(b.title, HEADING_MAX) }
    }
  }
}

/** Normaliza o conteúdo vindo do banco ou do painel. Nunca lança — sempre volta uma página válida. */
export function sanitizeAboutContent(value: unknown): AboutPageContent {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>).blocks : null
  if (!Array.isArray(raw)) return { blocks: [] }
  const blocks: AboutBlock[] = []
  for (const item of raw) {
    const bloco = sanitizeBlock(item)
    if (bloco) blocks.push(bloco)
    if (blocks.length === ABOUT_BLOCKS_MAX) break
  }
  return { blocks }
}
