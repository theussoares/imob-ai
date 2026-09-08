import type { AboutBlock, AboutPageContent } from '~~/shared/models/about-page'
import { ABOUT_BLOCK_TYPES } from '~~/shared/models/about-page'

/** Página é editada por vez, não é feed: teto generoso evita rolagem infinita no painel. */
export const ABOUT_BLOCKS_MAX = 30

const HEADING_MAX = 80
const TEXT_MAX = 4000
const IMAGE_ALT_MAX = 160
const IMAGE_CAPTION_MAX = 160
const STAT_VALUE_MAX = 20
const STAT_LABEL_MAX = 80

function str(v: unknown, max: number): string {
  return String(v ?? '').trim().slice(0, max)
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
      // Só http(s): imagem vem de upload para o Storage, nunca é um schema executável.
      const url = str(b.url, 2048)
      if (!/^https?:\/\//i.test(url)) return null
      return { type: 'image', url, alt: str(b.alt, IMAGE_ALT_MAX), caption: str(b.caption, IMAGE_CAPTION_MAX) }
    }
    case 'stat': {
      const value = str(b.value, STAT_VALUE_MAX)
      const label = str(b.label, STAT_LABEL_MAX)
      return value && label ? { type: 'stat', value, label } : null
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
