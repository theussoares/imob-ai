/**
 * Formatação das telas do portal.
 *
 * Fica em `shared/` e não dentro do componente porque quem lê isto é o cliente
 * final — inquilino no celular, não corretor treinado. Valor errado ou data no
 * formato americano nesta tela vira ligação para a imobiliária, então o
 * comportamento é testado em vez de confiado ao `toLocaleDateString` espalhado
 * por cada `<template>`.
 */

/** Reais, sem centavos — a mesma convenção que o resto do app usa para preço. */
export function formatBRL(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
}

/**
 * Data ISO (`2026-03-01`) em dd/mm/aaaa.
 *
 * Fatia a string em vez de passar por `new Date`: `new Date('2026-03-01')` é
 * interpretado como UTC meia-noite e, em qualquer fuso a oeste de Greenwich —
 * inclusive o nosso —, volta como o dia ANTERIOR. Vencimento de aluguel um dia
 * antes é exatamente o tipo de erro que ninguém reporta como bug, só desconfia
 * do sistema.
 */
export function formatDateBR(iso: string | null | undefined): string {
  if (!iso) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return '—'
  return `${m[3]}/${m[2]}/${m[1]}`
}

/** "01/03/2026 a 29/02/2028", com as pontas abertas quando faltar data. */
export function contractPeriodLabel(
  startedOn: string | null | undefined,
  endsOn: string | null | undefined,
): string {
  const inicio = formatDateBR(startedOn)
  const fim = formatDateBR(endsOn)
  if (inicio === '—' && fim === '—') return '—'
  if (fim === '—') return `desde ${inicio}`
  if (inicio === '—') return `até ${fim}`
  return `${inicio} a ${fim}`
}

/** "todo dia 10" — o jeito que a pessoa fala do vencimento. */
export function dueDayLabel(dueDay: number | null | undefined): string {
  if (!dueDay || dueDay < 1 || dueDay > 31) return '—'
  return `todo dia ${dueDay}`
}
