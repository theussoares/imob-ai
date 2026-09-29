/**
 * Formatação das telas da Área do Cliente.
 *
 * Datas chegam como `AAAA-MM-DD` (coluna `date`, sem fuso) e são fatiadas como
 * texto, sem `new Date()`: `new Date('2026-10-05')` é meia-noite em UTC, que no
 * Brasil ainda é dia 4 — o vencimento apareceria um dia antes. Num portal em que
 * a pessoa paga pelo que lê aqui, um dia a menos é multa que ela não devia.
 */

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

/** `2026-10-05` → `05/10/2026`; vazio → travessão. */
export function dataBR(v: string | null | undefined): string {
  if (!v) return '—'
  const [ano, mes, dia] = v.split('-')
  return `${dia}/${mes}/${ano}`
}

export function dinheiroBR(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/** Competência gravada no dia 1 → `outubro de 2026`. */
export function mesPorExtenso(competencia: string): string {
  const [a, m] = competencia.split('-')
  return `${MESES[Number(m) - 1]} de ${a}`
}

/** Competência gravada no dia 1 → `10/2026`. */
export function competenciaCurta(competencia: string | null): string {
  if (!competencia) return ''
  const [ano, mes] = competencia.split('-')
  return `${mes}/${ano}`
}

/**
 * A URL só se for `https:`; qualquer outra coisa vira null.
 *
 * Para `href` montado com dado que veio do banco (link do boleto no gateway).
 * O Vue NÃO filtra `javascript:` em `href`: um valor adulterado executaria
 * script na sessão do cliente, que guarda o token do portal no localStorage.
 */
export function urlHttps(u: string | null | undefined): string | null {
  if (!u) return null
  try {
    return new URL(u).protocol === 'https:' ? u : null
  } catch {
    return null
  }
}
