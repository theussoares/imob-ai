import { agora, type Ator, type Estado, type Resultado } from './acoes'
import { alterar } from './acoes-processo'
import { aprovarAnalise, devolverAnalise, enviarAnalise } from './analise-financeira'

/**
 * Análise do financeiro do processo de venda. Quem pode cada ação é do despachante (`ACOES_VENDA`): aqui só a
 * transição, que também registra no histórico (sem valores no texto: o `hist` chega a quem não vê o financeiro).
 */

export function enviarAnaliseFinanceira(estado: Estado, id: string, ator: Ator, quando = agora()): Resultado {
  return alterar(estado, id, ator, quando, (p) => {
    if (!(p.valor > 0)) return { ok: false, erro: 'Informe o valor da venda antes de enviar para análise.' }
    if (!(p.pct > 0)) return { ok: false, erro: 'Informe a % de comissão antes de enviar para análise.' }
    const r = enviarAnalise(p.analiseFin, ator.nome, quando)
    return r.ok ? { ok: true, acao: r.acao, processo: { ...p, analiseFin: r.analise } } : r
  })
}

export function aprovarAnaliseFinanceira(estado: Estado, id: string, ator: Ator, quando = agora()): Resultado {
  return alterar(estado, id, ator, quando, (p) => {
    const r = aprovarAnalise(p.analiseFin, ator.nome, quando)
    return r.ok ? { ok: true, acao: r.acao, processo: { ...p, analiseFin: r.analise } } : r
  })
}

export function devolverAnaliseFinanceira(estado: Estado, id: string, motivo: string, ator: Ator, quando = agora()): Resultado {
  return alterar(estado, id, ator, quando, (p) => {
    const r = devolverAnalise(p.analiseFin, motivo, ator.nome, quando)
    return r.ok ? { ok: true, acao: r.acao, processo: { ...p, analiseFin: r.analise } } : r
  })
}
