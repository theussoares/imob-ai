import { agora, type Ator, type Estado, type Resultado } from './acoes'
import { alterar } from './acoes-processo'
import { statusFinal } from './status'
import { tipoDeDocumento } from '~~/shared/utils/cpf-cnpj'
import type { Processo } from './types'

/**
 * Abertura editável, observações (do jurídico e do contrato) e arquivamento.
 *
 * Arquivar NÃO usa `alterar`: aquela função recusa processo encerrado (é a regra
 * «final é só leitura»), e arquivar só faz sentido justamente em processo final.
 * Arquivar também não apaga nada — o contrato sai da lista e vai para «Arquivados»,
 * de onde volta com «Restaurar» (decisão de 15/11: o jurídico só arquiva).
 */

export interface DadosAbertura {
  vendedor: { nome: string; cpf: string }
  comprador: { nome: string; cpf: string }
  imovel: string
  corretorId: string
  captadorId: string
  preliminar: { existe: boolean; arquivo: string | null }
}

export function salvarAbertura(estado: Estado, id: string, d: DadosAbertura, ator: Ator, quando = agora()): Resultado {
  return alterar(estado, id, ator, quando, (p) => {
    if (!d.vendedor.nome.trim()) return { ok: false, erro: 'Informe o vendedor.' }
    if (!d.comprador.nome.trim()) return { ok: false, erro: 'Informe o comprador.' }
    if (!d.imovel.trim()) return { ok: false, erro: 'Informe o imóvel.' }
    for (const [rot, cpf] of [['vendedor', d.vendedor.cpf], ['comprador', d.comprador.cpf]] as const) {
      // Vazio passa: a abertura se completa aos poucos, mas a etapa 1 só conclui com ele (`pendenciasEtapa`).
      if (cpf.trim() && !tipoDeDocumento(cpf)) {
        return { ok: false, erro: `CPF ou CNPJ do ${rot} inválido. Confira os dígitos.` }
      }
    }
    const arquivo = d.preliminar.existe ? d.preliminar.arquivo?.trim() || null : null
    if (arquivo && !/\.pdf$/i.test(arquivo)) return { ok: false, erro: 'O contrato preliminar precisa ser um PDF.' }
    return {
      ok: true,
      acao: 'Atualizou os dados da abertura',
      processo: {
        ...p,
        vendedor: { ...p.vendedor, nome: d.vendedor.nome.trim(), cpf: d.vendedor.cpf.trim() },
        comprador: { ...p.comprador, nome: d.comprador.nome.trim(), cpf: d.comprador.cpf.trim() },
        imovel: d.imovel.trim(),
        corretorId: d.corretorId,
        captadorId: d.captadorId,
        preliminar: { existe: d.preliminar.existe, arquivo },
      },
    }
  })
}

export const LIMITE_OBS = 2000

export function salvarObservacao(estado: Estado, id: string, obs: string, ator: Ator, quando = agora()): Resultado {
  return alterar(estado, id, ator, quando, (p) => {
    if (obs.length > LIMITE_OBS) return { ok: false, erro: `As observações passam de ${LIMITE_OBS} caracteres.` }
    return { ok: true, acao: 'Atualizou as observações do jurídico', processo: { ...p, obs: obs.trim() } }
  })
}

export const LIMITE_ANOTACOES = 4000

/**
 * Observações do contrato (o que foi combinado). Livre para todo perfil que vê o processo — o
 * escopo de quem vê é decidido fora (servidor e tela); aqui fica a regra do texto. Processo encerrado recusa, pela mesma regra
 * de «final é só leitura» de `alterar`: um acordo novo depois da conclusão é um processo novo.
 */
export function salvarAnotacoes(estado: Estado, id: string, texto: string, ator: Ator, quando = agora()): Resultado {
  return alterar(estado, id, ator, quando, (p) => {
    if (texto.length > LIMITE_ANOTACOES) return { ok: false, erro: `As observações passam de ${LIMITE_ANOTACOES} caracteres.` }
    // Só as pontas: quebra de linha no meio é a lista de parcelas que a pessoa digitou.
    const limpo = texto.trim()
    if (limpo === (p.anotacoes ?? '')) return { ok: false, erro: 'As observações não mudaram.' }
    return {
      ok: true,
      acao: limpo ? 'Atualizou as observações do contrato' : 'Apagou as observações do contrato',
      processo: { ...p, anotacoes: limpo },
    }
  })
}

function trocarArquivado(estado: Estado, id: string, arquivado: boolean, ator: Ator, quando: string): Resultado {
  const p = estado.processos.find((x) => x.id === id)
  if (!p) return { ok: false, erro: 'Processo não encontrado.' }
  if (arquivado) {
    if (!statusFinal(p.status)) return { ok: false, erro: 'Só dá para arquivar contrato concluído ou cancelado.' }
    if (p.arquivado) return { ok: false, erro: 'Este contrato já está arquivado.' }
  } else if (!p.arquivado) {
    return { ok: false, erro: 'Este contrato não está arquivado.' }
  }
  const novo: Processo = {
    ...p,
    arquivado,
    updated: quando,
    hist: [{ acao: arquivado ? 'Arquivou o contrato' : 'Restaurou o contrato dos arquivados', quem: ator.nome, quando }, ...p.hist],
  }
  return { ok: true, estado: { ...estado, processos: estado.processos.map((x) => (x.id === id ? novo : x)) } }
}

export const arquivarProcesso = (e: Estado, id: string, a: Ator, q = agora()) => trocarArquivado(e, id, true, a, q)
export const restaurarProcesso = (e: Estado, id: string, a: Ator, q = agora()) => trocarArquivado(e, id, false, a, q)
