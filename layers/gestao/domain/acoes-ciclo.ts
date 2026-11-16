import { agora, type Ator, type Estado, type Resultado } from './acoes'
import { alterar } from './acoes-processo'
import { statusFinal } from './status'
import type { Processo } from './types'

/**
 * Abertura editável, observações do jurídico e arquivamento.
 *
 * Arquivar NÃO usa `alterar`: aquela função recusa processo encerrado (é a regra
 * «final é só leitura»), e arquivar só faz sentido justamente em processo final.
 * Arquivar também não apaga nada — o contrato sai da lista e vai para «Arquivados»,
 * de onde volta com «Restaurar» (decisão de 15/11: o jurídico só arquiva).
 */

const SO_DIGITOS = (t: string) => t.replace(/\D/g, '')

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
      if (cpf.trim() && ![11, 14].includes(SO_DIGITOS(cpf).length)) {
        return { ok: false, erro: `CPF ou CNPJ do ${rot} deve ter 11 ou 14 dígitos.` }
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
