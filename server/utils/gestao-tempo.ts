/**
 * Relógio do painel de gestão em horário de Brasília.
 *
 * As funções do domínio (`agora()`, `hojeISO()`) formatam com os getters locais do
 * `Date`, e o servidor roda em UTC: uma ação às 22h de Brasília entraria no
 * histórico como 01h do dia seguinte, e o aviso «vence hoje» viraria «venceu ontem»
 * à noite. Em vez de mexer no domínio (que o mock também usa, no fuso do navegador),
 * o servidor entrega a elas um `Date` cujos getters locais já mostram o relógio de
 * São Paulo. Alternativa descartada: definir `TZ` no deploy — vale para o processo
 * todo, inclusive o que não é do gestão.
 */
export function agoraBrasil(agora: Date = new Date()): Date {
  return new Date(agora.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
}
