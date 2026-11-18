/**
 * Fuso único do painel de gestão.
 *
 * Havia três relógios: a venda gravava a hora em UTC (o servidor roda em UTC), a locação
 * em UTC-3 fixo e a consulta/lixeira em «America/Sao_Paulo». O mesmo minuto aparecia
 * com horas diferentes na venda e na locação. Agora tudo (histórico, «hoje», rótulos de
 * consulta e de documento) passa por este fuso. Os instantes continuam guardados em UTC
 * (`updated_at`, `quando` das tabelas); só o RÓTULO do histórico, que é texto
 * «dd/mm/aaaa hh:mm», é gravado já no relógio deste fuso.
 *
 * Por tenant ainda não: a imobiliária atendida hoje fica em Campo Grande (UTC-4). Quando
 * houver cliente em outro fuso, isto vira coluna de `tenants`/config. Alternativa
 * descartada: usar o fuso do navegador — o histórico é compartilhado e gravado pelo
 * servidor, dois usuários veriam horas diferentes para o mesmo evento.
 */
export const FUSO_GESTAO = 'America/Campo_Grande'

/**
 * `Date` cujos getters locais mostram o relógio de `fuso`. As funções do domínio
 * (`agora()`, `hojeISO()`) formatam com getters locais; o servidor roda em UTC.
 */
export function agoraNoFuso(agora: Date = new Date(), fuso: string = FUSO_GESTAO): Date {
  return new Date(agora.toLocaleString('en-US', { timeZone: fuso }))
}

/** ISO (instante) → «dd/mm/aaaa hh:mm» no relógio do fuso. */
export function rotuloQuando(iso: string, fuso: string = FUSO_GESTAO): string {
  const partes = new Intl.DateTimeFormat('pt-BR', {
    timeZone: fuso,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso))
  const g = (t: string) => partes.find((p) => p.type === t)?.value ?? ''
  return `${g('day')}/${g('month')}/${g('year')} ${g('hour')}:${g('minute')}`
}
