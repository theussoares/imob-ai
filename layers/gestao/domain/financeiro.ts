import { calcularComissao } from './commission.ts'
import { locacaoFinal } from './locacao-status.ts'
import { devidoDaCobranca, ENCARGOS_PADRAO, ROTULO_SITUACAO_COBRANCA, type EncargosConfig, type SituacaoCobranca } from './cobranca.ts'
import type { Cobranca, Locacao, Processo } from './types'

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

/** Mesma situação da tela da locação: vem de `cobranca.ts`, a única regra. */
export type SituacaoAluguel = SituacaoCobranca
export type SituacaoRepasse = 'sem-pagamento' | 'pendente' | 'feito'

export interface LinhaAluguel {
  locacaoId: string
  cobrancaId: string
  imovel: string
  competencia: string
  vencimento: string
  /** valor original do aluguel */
  valor: number
  situacao: SituacaoAluguel
  diasAtraso: number
  multa: number
  juros: number
  /** original + multa + juros */
  atualizado: number
  /** já recebido (soma dos pagamentos; legado quitado sem lista = valor) */
  recebido: number
  /** o que falta receber, com encargos */
  saldo: number
  /** taxa da imobiliária sobre este aluguel */
  taxa: number
  /** valor a repassar ao proprietário (aluguel menos a taxa) */
  repasse: number
  /** o que ainda falta repassar */
  repasseSaldo: number
  repasseSituacao: SituacaoRepasse
}

export interface ResumoLocacoes {
  linhas: LinhaAluguel[]
  recebido: number
  emAberto: number
  /** saldo atualizado (com multa e juros) do que já venceu e não foi quitado */
  emAtraso: number
  taxaRecebida: number
  repasseFeito: number
  repassePendente: number
}

/** Competências (AAAA-MM) que têm cobrança, da mais recente para a mais antiga. */
export function competenciasDisponiveis(locacoes: Locacao[]): string[] {
  return [...new Set(locacoes.flatMap((l) => l.cobrancas.map((c) => c.competencia)))].sort().reverse()
}

const repassado = (c: Cobranca) => (c.repasse ? (c.repasse.feito ? (c.repasse.repassado ?? c.repasse.valor) : (c.repasse.repassado ?? 0)) : 0)

/**
 * Cobranças de todas as locações, opcionalmente de uma competência. Situação, encargos e saldo vêm de
 * `devidoDaCobranca` (a mesma da tela da locação). A taxa da imobiliária só conta de cobrança QUITADA
 * (a que libera o repasse); multa e juros não entram na taxa nem no repasse (ver `cobranca.ts`).
 */
export function resumoLocacoes(locacoes: Locacao[], hoje: string, competencia = '', cfg: EncargosConfig = ENCARGOS_PADRAO): ResumoLocacoes {
  const linhas: LinhaAluguel[] = []
  for (const l of locacoes) {
    for (const c of l.cobrancas) {
      if (competencia && c.competencia !== competencia) continue
      const taxa = centavos((c.valor * (l.contrato?.taxaPct ?? 0)) / 100)
      const d = devidoDaCobranca(c, hoje, cfg)
      const repasse = c.repasse?.valor ?? centavos(c.valor - taxa)
      linhas.push({
        locacaoId: l.id,
        cobrancaId: c.id,
        imovel: l.imovel,
        competencia: c.competencia,
        vencimento: c.vencimento,
        valor: c.valor,
        situacao: d.situacao,
        diasAtraso: d.encargos.dias,
        multa: d.encargos.multa,
        juros: d.encargos.juros,
        atualizado: d.encargos.atualizado,
        recebido: d.pago || (c.pago ? c.valor : 0),
        saldo: d.saldo,
        taxa,
        repasse,
        repasseSaldo: !c.pago ? 0 : c.repasse?.feito ? 0 : centavos(repasse - (c.repasse?.repassado ?? 0)),
        repasseSituacao: !c.pago ? 'sem-pagamento' : c.repasse?.feito ? 'feito' : 'pendente',
      })
    }
  }
  linhas.sort((a, b) => b.competencia.localeCompare(a.competencia) || a.locacaoId.localeCompare(b.locacaoId))
  const soma = (f: (l: LinhaAluguel) => boolean, v: (l: LinhaAluguel) => number) =>
    centavos(linhas.filter(f).reduce((t, l) => t + v(l), 0))
  const vencidaNaoQuitada = (l: LinhaAluguel) => l.situacao !== 'paga' && l.diasAtraso > 0
  const porId = new Map(locacoes.flatMap((l) => l.cobrancas.map((c) => [`${l.id}/${c.id}`, c] as const)))
  return {
    linhas,
    recebido: soma(() => true, (l) => l.recebido),
    emAberto: soma((l) => l.situacao !== 'paga' && !vencidaNaoQuitada(l), (l) => l.saldo),
    emAtraso: soma(vencidaNaoQuitada, (l) => l.saldo),
    taxaRecebida: soma((l) => l.situacao === 'paga', (l) => l.taxa),
    repasseFeito: soma(() => true, (l) => {
      const c = porId.get(`${l.locacaoId}/${l.cobrancaId}`)
      return c ? repassado(c) : 0
    }),
    repassePendente: soma((l) => l.repasseSituacao === 'pendente', (l) => l.repasseSaldo),
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
export function pendenciasFinanceiras(locacoes: Locacao[], hoje: string, cfg: EncargosConfig = ENCARGOS_PADRAO): PendenciasFinanceiras {
  const abertas = locacoes.filter((l) => !locacaoFinal(l.status))
  const { linhas } = resumoLocacoes(abertas, hoje, '', cfg)
  const porVencimento = (a: LinhaAluguel, b: LinhaAluguel) => a.vencimento.localeCompare(b.vencimento)
  return {
    receber: linhas.filter((l) => l.situacao !== 'paga').sort((a, b) => Number(b.diasAtraso > 0) - Number(a.diasAtraso > 0) || porVencimento(a, b)),
    repassar: linhas.filter((l) => l.repasseSituacao === 'pendente').sort(porVencimento),
  }
}

export const ROTULO_SITUACAO = ROTULO_SITUACAO_COBRANCA
export const ROTULO_REPASSE: Record<SituacaoRepasse, string> = {
  'sem-pagamento': 'Aguarda pagamento',
  pendente: 'Repasse pendente',
  feito: 'Repasse feito',
}

/** O que a tela Financeiro lê: do servidor em `http`, calculado localmente em `mock` (mesmas funções). */
export interface RespostaFinanceiro {
  vendas: ResumoVendas
  locacoes: ResumoLocacoes
  competencias: string[]
  pendencias: PendenciasFinanceiras
  /** `true` = passou de 5000 contratos por tipo; os totais cobrem só os mais recentes. */
  truncado: boolean
}
