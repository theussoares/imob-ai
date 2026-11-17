import { calcularComissao } from './commission.ts'
import { diasEntre } from './avisos-locacao.ts'
import { locacaoFinal } from './locacao-status.ts'
import type { Locacao, Processo } from './types'

/**
 * Financeiro: visão única do dinheiro das vendas (comissão) e das locações (aluguel,
 * taxa da imobiliária e repasse ao proprietário).
 *
 * Só soma o que as telas de venda e locação já registram; não inventa dado. Quem vê é
 * quem tem a permissão `valores` — a tela decide, esta função não filtra por perfil.
 */

const centavos = (n: number) => Math.round(n * 100) / 100

// ---------------------------------------------------------------- vendas

export interface LinhaVenda {
  id: string
  imovel: string
  status: Processo['status']
  valor: number
  comissaoTotal: number
  adiantado: number
  aReceber: number
}

export interface ResumoVendas {
  linhas: LinhaVenda[]
  comissaoTotal: number
  adiantado: number
  aReceber: number
}

/** Venda cancelada não gera comissão e por isso fica fora da soma. */
export function resumoVendas(processos: Processo[]): ResumoVendas {
  const linhas = processos
    .filter((p) => p.status !== 'Venda cancelada')
    .map((p): LinhaVenda => {
      const c = calcularComissao(p)
      return { id: p.id, imovel: p.imovel, status: p.status, valor: p.valor, comissaoTotal: c.total, adiantado: c.adiantado, aReceber: c.restante }
    })
  const soma = (f: (l: LinhaVenda) => number) => centavos(linhas.reduce((t, l) => t + f(l), 0))
  return {
    linhas,
    comissaoTotal: soma((l) => l.comissaoTotal),
    adiantado: soma((l) => l.adiantado),
    aReceber: soma((l) => l.aReceber),
  }
}

// -------------------------------------------------------------- locações

export type SituacaoAluguel = 'paga' | 'aberta' | 'atrasada'
export type SituacaoRepasse = 'sem-pagamento' | 'pendente' | 'feito'

export interface LinhaAluguel {
  locacaoId: string
  cobrancaId: string
  imovel: string
  competencia: string
  vencimento: string
  valor: number
  situacao: SituacaoAluguel
  /** taxa da imobiliária sobre este aluguel */
  taxa: number
  /** valor a repassar ao proprietário (aluguel menos a taxa) */
  repasse: number
  repasseSituacao: SituacaoRepasse
}

export interface ResumoLocacoes {
  linhas: LinhaAluguel[]
  recebido: number
  emAberto: number
  emAtraso: number
  taxaRecebida: number
  repasseFeito: number
  repassePendente: number
}

/** Competências (AAAA-MM) que têm cobrança, da mais recente para a mais antiga. */
export function competenciasDisponiveis(locacoes: Locacao[]): string[] {
  return [...new Set(locacoes.flatMap((l) => l.cobrancas.map((c) => c.competencia)))].sort().reverse()
}

/**
 * Cobranças de todas as locações, opcionalmente de uma competência. O repasse vem da
 * cobrança (valor já calculado quando o pagamento foi registrado); quando falta, cai na
 * conta aluguel menos taxa, para a linha nunca ficar sem número.
 */
export function resumoLocacoes(locacoes: Locacao[], hoje: string, competencia = ''): ResumoLocacoes {
  const linhas: LinhaAluguel[] = []
  for (const l of locacoes) {
    for (const c of l.cobrancas) {
      if (competencia && c.competencia !== competencia) continue
      const taxa = centavos((c.valor * (l.contrato?.taxaPct ?? 0)) / 100)
      const situacao: SituacaoAluguel = c.pago ? 'paga' : diasEntre(hoje, c.vencimento) < 0 ? 'atrasada' : 'aberta'
      linhas.push({
        locacaoId: l.id,
        cobrancaId: c.id,
        imovel: l.imovel,
        competencia: c.competencia,
        vencimento: c.vencimento,
        valor: c.valor,
        situacao,
        taxa,
        repasse: c.repasse?.valor ?? centavos(c.valor - taxa),
        repasseSituacao: !c.pago ? 'sem-pagamento' : c.repasse?.feito ? 'feito' : 'pendente',
      })
    }
  }
  linhas.sort((a, b) => b.competencia.localeCompare(a.competencia) || a.locacaoId.localeCompare(b.locacaoId))
  const soma = (f: (l: LinhaAluguel) => boolean, v: (l: LinhaAluguel) => number) =>
    centavos(linhas.filter(f).reduce((t, l) => t + v(l), 0))
  return {
    linhas,
    recebido: soma((l) => l.situacao === 'paga', (l) => l.valor),
    emAberto: soma((l) => l.situacao === 'aberta', (l) => l.valor),
    emAtraso: soma((l) => l.situacao === 'atrasada', (l) => l.valor),
    taxaRecebida: soma((l) => l.situacao === 'paga', (l) => l.taxa),
    repasseFeito: soma((l) => l.repasseSituacao === 'feito', (l) => l.repasse),
    repassePendente: soma((l) => l.repasseSituacao === 'pendente', (l) => l.repasse),
  }
}

export interface PendenciasFinanceiras {
  /** aluguéis ainda não pagos: atrasados primeiro, depois por vencimento */
  receber: LinhaAluguel[]
  /** aluguéis pagos cujo repasse ao proprietário ainda não foi feito, do mais antigo */
  repassar: LinhaAluguel[]
}

/**
 * Fila de trabalho do financeiro: o que ainda pede ação, de todas as competências.
 * Locação encerrada fica de fora porque o domínio só aceita consulta nela; a linha
 * apareceria com botão que sempre falha.
 */
export function pendenciasFinanceiras(locacoes: Locacao[], hoje: string): PendenciasFinanceiras {
  const abertas = locacoes.filter((l) => !locacaoFinal(l.status))
  const { linhas } = resumoLocacoes(abertas, hoje)
  const porVencimento = (a: LinhaAluguel, b: LinhaAluguel) => a.vencimento.localeCompare(b.vencimento)
  return {
    receber: linhas.filter((l) => l.situacao !== 'paga').sort((a, b) => Number(b.situacao === 'atrasada') - Number(a.situacao === 'atrasada') || porVencimento(a, b)),
    repassar: linhas.filter((l) => l.repasseSituacao === 'pendente').sort(porVencimento),
  }
}

export const ROTULO_SITUACAO: Record<SituacaoAluguel, string> = { paga: 'Paga', aberta: 'Em aberto', atrasada: 'Em atraso' }
export const ROTULO_REPASSE: Record<SituacaoRepasse, string> = {
  'sem-pagamento': 'Aguarda pagamento',
  pendente: 'Repasse pendente',
  feito: 'Repasse feito',
}
