/**
 * Contraste de texto branco sobre as cores que a imobiliária escolhe.
 *
 * `brand_primary`, `brand_accent` e a cor do botão do WhatsApp viram fundo de
 * texto branco no site inteiro (selo "Venda", botão de busca, pastilha ativa,
 * botão do WhatsApp). O painel aceitava qualquer cor: um amarelo ou um verde
 * claro deixava esses textos ilegíveis em todas as páginas do cliente, e nada
 * avisava — quem escolhe a cor vê o preview no monitor dele, não no celular ao
 * sol de quem visita.
 *
 * Aviso, não bloqueio: a cor é da marca do cliente e a decisão é dele. O que o
 * painel deve é dizer o custo antes de ele salvar.
 */

/** WCAG 2.x, AA para texto normal. */
export const CONTRASTE_MINIMO = 4.5

function canal(c: number): number {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

/** Luminância relativa (WCAG) de `#rgb` ou `#rrggbb`; `null` se não for hex. */
export function luminancia(hex: string): number | null {
  const m = hex.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (!m) return null
  let h = m[1]!
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const n = parseInt(h, 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b)
}

/** Razão de contraste do branco sobre a cor, ou `null` se a cor for inválida. */
export function contrasteComBranco(hex: string): number | null {
  const l = luminancia(hex)
  if (l === null) return null
  return 1.05 / (l + 0.05)
}

/**
 * Mensagem de aviso quando texto branco fica abaixo do AA sobre a cor, ou
 * `null` quando está ok (ou a cor está vazia/inválida — aí não há o que medir).
 */
export function avisoDeContraste(hex: string | null | undefined): string | null {
  if (!hex) return null
  const r = contrasteComBranco(hex)
  if (r === null || r >= CONTRASTE_MINIMO) return null
  return `Texto branco sobre esta cor fica difícil de ler (contraste ${r.toFixed(1)}:1, o mínimo recomendado é ${CONTRASTE_MINIMO}:1). Escolha um tom mais escuro.`
}
