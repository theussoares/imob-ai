/** Uma página do site que pode ser linkada no rodapé. */
export interface FooterPage {
  path: string
  label: string
}

/** O que o cliente ajustou numa página. Ausente = padrão. */
export interface FooterPageOverride {
  label?: string
  visible?: boolean
}

export type FooterPageOverrides = Record<string, FooterPageOverride>

const LABEL_MAX = 40

/**
 * Páginas fixas que sempre podem ir ao rodapé.
 *
 * O REGISTRO é a fonte de verdade sobre quais páginas existem — não o banco. É
 * o que permite ao cliente descobrir uma página que ele nunca saberia digitar, e
 * o que faz uma página nova aparecer sozinha para todo mundo quando a criarmos.
 *
 * Estar aqui já é a decisão de que a página pode ser linkada; por isso o padrão
 * é visível, e esconder é escolha do cliente.
 */
export const STATIC_FOOTER_PAGES: FooterPage[] = [{ path: '/quero-vender', label: 'Quero vender ou alugar' }]

/**
 * Junta o registro do código com os ajustes do cliente.
 *
 * Guardamos só os ajustes, nunca a lista inteira: uma cópia no banco deixaria
 * de fora toda página criada depois, e o cliente que salvou uma vez nunca mais
 * veria novidade.
 */
export function resolveFooterPages(registro: FooterPage[], overrides: FooterPageOverrides): FooterPage[] {
  const out: FooterPage[] = []
  for (const page of registro) {
    const ajuste = overrides[page.path]
    if (ajuste?.visible === false) continue
    const label = ajuste?.label?.trim()
    // Rótulo apagado volta ao padrão: link em branco no rodapé é pior que o
    // texto que o cliente não gostou.
    out.push({ path: page.path, label: label || page.label })
  }
  return out
}

/** Normaliza o que vem do banco (JSONB) ou do painel. */
export function sanitizeFooterPageOverrides(value: unknown): FooterPageOverrides {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: FooterPageOverrides = {}
  for (const [path, raw] of Object.entries(value as Record<string, unknown>)) {
    // A chave vira o destino de um link. Só caminho interno passa — o registro
    // já limita na prática, mas o JSONB aceita qualquer coisa, inclusive
    // gravada por SQL direto.
    if (!path.startsWith('/') || path.startsWith('//')) continue
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
    const { label, visible } = raw as { label?: unknown; visible?: unknown }
    const ajuste: FooterPageOverride = {}
    if (typeof label === 'string' && label.trim()) ajuste.label = label.trim().slice(0, LABEL_MAX)
    if (typeof visible === 'boolean') ajuste.visible = visible
    if (Object.keys(ajuste).length) out[path] = ajuste
  }
  return out
}
