/** Cor da plataforma, usada quando o tenant não tem uma válida. */
export const DEFAULT_BRAND_COLOR = '#0f3d38'

/**
 * Só deixa passar cor hex.
 *
 * `brand_primary` é texto livre no banco e vai parar dentro de um SVG
 * (favicon) e de um JSON servido ao navegador (manifest). Validar aqui é o que
 * impede um valor arbitrário de virar conteúdo nesses documentos — e, no caso
 * mais chato, um manifest inválido que faz o navegador recusar a instalação
 * sem dizer por quê.
 */
export function safeBrandColor(value: string | null | undefined, fallback = DEFAULT_BRAND_COLOR): string {
  return value && /^#[0-9a-f]{3,8}$/i.test(value) ? value : fallback
}
