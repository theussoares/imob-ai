/**
 * Tema da vitrine e estilo do cabeçalho — fonte única das listas e rótulos.
 * Ver docs/superpowers/specs/2026-09-25-temas-da-vitrine-design.md.
 *
 * Listas fechadas, e não texto livre: o valor vira atributo no `<html>`
 * (`data-tema`, `data-cabecalho`) e é ele que escolhe um bloco de CSS estático
 * em main.css. Nenhum texto do banco entra no CSS — um valor fora da lista só
 * cai no padrão, não tem como virar injeção.
 *
 * Sem acento nas chaves — vão para o banco e para seletor CSS. O acento mora
 * no rótulo, que é o que a pessoa lê no painel.
 */

export const SITE_THEMES = ['classico', 'moderno', 'alto_padrao', 'acolhedor'] as const
export type SiteTheme = (typeof SITE_THEMES)[number]

export const SITE_THEME_LABELS: Record<SiteTheme, string> = {
  classico: 'Clássico',
  moderno: 'Moderno',
  alto_padrao: 'Alto padrão',
  acolhedor: 'Acolhedor',
}

export const HEADER_STYLES = ['claro', 'marca', 'escuro'] as const
export type HeaderStyle = (typeof HEADER_STYLES)[number]

export const HEADER_STYLE_LABELS: Record<HeaderStyle, string> = {
  claro: 'Claro',
  marca: 'Cor da marca',
  escuro: 'Escuro',
}

/**
 * Cabeçalho que o painel PRÉ-SELECIONA ao escolher um tema. Só sugestão: o
 * cliente muda à vontade, e trocar de tema não sobrescreve um cabeçalho que ele
 * já tinha escolhido à mão (quem decide isso é a tela, não este mapa).
 */
export const SUGGESTED_HEADER: Record<SiteTheme, HeaderStyle> = {
  classico: 'claro',
  moderno: 'claro',
  alto_padrao: 'escuro',
  acolhedor: 'marca',
}

/** `classico` é o site de antes dos temas — padrão da coluna e de qualquer valor inválido. */
export const DEFAULT_SITE_THEME: SiteTheme = 'classico'
export const DEFAULT_HEADER_STYLE: HeaderStyle = 'claro'

/**
 * Normaliza o que veio do banco ou do formulário.
 *
 * O `check` do Postgres não basta: `tenants` aceita UPDATE direto pelo
 * PostgREST, e escrita manual no SQL Editor já contornou constraint neste
 * repositório. Quem lê é quem precisa desconfiar — mesmo raciocínio do
 * `temaCss` das cores e do `tomValido` da IA.
 */
export function temaValido(v: unknown): SiteTheme {
  return (SITE_THEMES as readonly unknown[]).includes(v) ? (v as SiteTheme) : DEFAULT_SITE_THEME
}

export function cabecalhoValido(v: unknown): HeaderStyle {
  return (HEADER_STYLES as readonly unknown[]).includes(v) ? (v as HeaderStyle) : DEFAULT_HEADER_STYLE
}
