import { hojeISO, somarDias } from './avisos-locacao.ts'

/**
 * Atalhos do seletor de período (de/até em ISO yyyy-mm-dd, ambos inclusivos).
 *
 * Função pura com a data de referência injetável: o teste fixa o «hoje» em vez de
 * depender do relógio. Alternativa descartada: calcular dentro do componente com
 * `new Date()` — não dá para testar em Node puro e vira bug de virada de mês.
 */

export interface Periodo {
  de: string
  ate: string
}

export type AtalhoPeriodo = 'hoje' | '7d' | '30d' | 'mes' | 'mes-passado'

export const ATALHOS_PERIODO: { id: AtalhoPeriodo; rotulo: string }[] = [
  { id: 'hoje', rotulo: 'Hoje' },
  { id: '7d', rotulo: 'Últimos 7 dias' },
  { id: '30d', rotulo: 'Últimos 30 dias' },
  { id: 'mes', rotulo: 'Este mês' },
  { id: 'mes-passado', rotulo: 'Mês passado' },
]

/**
 * `Date` cujos getters locais mostram o relógio de Brasília, no mesmo espírito de
 * `agoraBrasil` do servidor (server/utils/gestao-tempo.ts). Repetida aqui porque o
 * domínio é compartilhado com o navegador e não pode importar de `server/`; sem ela,
 * «Hoje» viraria o dia seguinte à noite para quem está em UTC.
 */
export function agoraBrasilData(agora: Date = new Date()): Date {
  return new Date(agora.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
}

const p2 = (n: number) => String(n).padStart(2, '0')

/** `agora` já deve estar no relógio de Brasília (use `agoraBrasilData`). */
export function periodoDoAtalho(id: AtalhoPeriodo, agora: Date = agoraBrasilData()): Periodo {
  const hoje = hojeISO(agora)
  const ano = agora.getFullYear()
  const mes = agora.getMonth() // 0-11
  switch (id) {
    case 'hoje':
      return { de: hoje, ate: hoje }
    // «Últimos N dias» conta o dia de hoje: 7 dias = hoje e os 6 anteriores.
    case '7d':
      return { de: somarDias(hoje, -6), ate: hoje }
    case '30d':
      return { de: somarDias(hoje, -29), ate: hoje }
    case 'mes':
      return { de: `${ano}-${p2(mes + 1)}-01`, ate: hoje }
    case 'mes-passado': {
      const a = mes === 0 ? ano - 1 : ano
      const m = mes === 0 ? 12 : mes
      // Dia 0 do mês seguinte = último dia deste, sem tabela de meses/bissexto.
      const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate()
      return { de: `${a}-${p2(m)}-01`, ate: `${a}-${p2(m)}-${p2(ultimo)}` }
    }
  }
}

/** Atalho que reproduz exatamente o período, ou null (então é «Personalizado»). */
export function atalhoDoPeriodo(p: Periodo, agora: Date = agoraBrasilData()): AtalhoPeriodo | null {
  if (!p.de || !p.ate) return null
  return ATALHOS_PERIODO.find((a) => {
    const x = periodoDoAtalho(a.id, agora)
    return x.de === p.de && x.ate === p.ate
  })?.id ?? null
}

const br = (iso: string) => (/^(\d{4})-(\d{2})-(\d{2})$/.test(iso) ? `${iso.slice(8)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '')

/** Texto do botão. Período aberto de um lado aparece como «a partir de» / «até». */
export function textoPeriodo(p: Periodo, vazio = 'Qualquer data'): string {
  const de = br(p.de)
  const ate = br(p.ate)
  if (de && ate) return de === ate ? de : `${de} – ${ate}`
  if (de) return `A partir de ${de}`
  if (ate) return `Até ${ate}`
  return vazio
}
