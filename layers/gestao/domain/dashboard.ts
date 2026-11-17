import { avisosLocacao, diasEntre, type NivelAviso } from './avisos-locacao.ts'
import { locacaoFinal } from './locacao-status.ts'
import { statusFinal } from './status.ts'
import type { Documento, Locacao, Processo } from './types'

/**
 * Números do Dashboard, calculados sobre o que a sessão enxerga (a tela passa as listas
 * já filtradas por perfil): o corretor vê o painel só dos contratos dele.
 *
 * Os valores em R$ ficam de fora de propósito. Quem tem a permissão `valores` os vê no
 * Financeiro; o Dashboard só conta, assim não precisa de um segundo filtro por permissão.
 */

/** Contrato sem movimento há mais que isto aparece em «Precisa de atenção». */
export const DIAS_PARADO = 7

export interface ItemAtencao {
  id: string
  tipo: 'venda' | 'locacao'
  titulo: string
  texto: string
  nivel: NivelAviso
  href: string
}

export interface ResumoDashboard {
  vendas: { andamento: number; concluidas: number; canceladas: number }
  locacoes: { ativas: number; implantacao: number; encerradas: number }
  aluguelEmAtraso: number
  documentosParaConferir: number
  atencao: ItemAtencao[]
}

/** `dd/mm/aaaa hh:mm` (texto de exibição do protótipo) → `aaaa-mm-dd`; vazio se não parsear. */
export function dataDoAtualizado(texto: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(texto)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : ''
}

const PESO: Record<NivelAviso, number> = { vencido: 0, urgente: 1, atencao: 2, info: 3 }

export function resumoDashboard(
  processos: Processo[],
  locacoes: Locacao[],
  documentos: Documento[],
  hoje: string,
  limiteAtencao = 6,
): ResumoDashboard {
  const vendasAtivas = processos.filter((p) => !p.arquivado)
  const locacoesAtivas = locacoes.filter((l) => !l.arquivado)

  const idsVisiveis = new Set([...vendasAtivas.map((p) => p.id), ...locacoesAtivas.map((l) => l.id)])
  const atencao: ItemAtencao[] = []

  for (const l of locacoesAtivas) {
    for (const a of avisosLocacao(l, hoje)) {
      atencao.push({ id: l.id, tipo: 'locacao', titulo: `${l.id} · ${l.imovel}`, texto: a.texto, nivel: a.nivel, href: `/gestao/locacao/${l.id}` })
    }
  }

  const parado = (updated: string) => {
    const d = dataDoAtualizado(updated)
    const dias = d ? diasEntre(d, hoje) : 0
    return dias > DIAS_PARADO ? dias : 0
  }
  for (const p of vendasAtivas) {
    const dias = statusFinal(p.status) ? 0 : parado(p.updated)
    if (dias) atencao.push({ id: p.id, tipo: 'venda', titulo: `${p.id} · ${p.imovel}`, texto: `Sem movimento há ${dias} dias (${p.status}).`, nivel: 'atencao', href: `/gestao/vendas/${p.id}` })
  }
  for (const l of locacoesAtivas) {
    const dias = locacaoFinal(l.status) ? 0 : parado(l.updated)
    if (dias) atencao.push({ id: l.id, tipo: 'locacao', titulo: `${l.id} · ${l.imovel}`, texto: `Sem movimento há ${dias} dias (${l.status}).`, nivel: 'atencao', href: `/gestao/locacao/${l.id}` })
  }
  atencao.sort((a, b) => PESO[a.nivel] - PESO[b.nivel])

  return {
    vendas: {
      andamento: vendasAtivas.filter((p) => !statusFinal(p.status)).length,
      concluidas: vendasAtivas.filter((p) => p.status === 'Venda concluída').length,
      canceladas: vendasAtivas.filter((p) => p.status === 'Venda cancelada').length,
    },
    locacoes: {
      ativas: locacoesAtivas.filter((l) => l.status === 'Ativa').length,
      implantacao: locacoesAtivas.filter((l) => l.status !== 'Ativa' && !locacaoFinal(l.status)).length,
      encerradas: locacoesAtivas.filter((l) => locacaoFinal(l.status)).length,
    },
    aluguelEmAtraso: locacoesAtivas.reduce(
      (n, l) => n + avisosLocacao(l, hoje).filter((a) => a.tipo === 'aluguel' && a.nivel === 'vencido').length,
      0,
    ),
    documentosParaConferir: documentos.filter((d) => !d.apagado && d.estado === 'enviado' && idsVisiveis.has(d.processoId)).length,
    atencao: atencao.slice(0, limiteAtencao),
  }
}
