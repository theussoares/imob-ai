import type { SupabaseClient } from '@supabase/supabase-js'
import { buscarVenda, gravarVenda } from '~~/server/repositories/gestao-venda.repository'
import { listarDocumentosDoAlvo } from '~~/server/repositories/gestao-documento.repository'

/**
 * Mantém a marca `pdf` do processo («contrato com PDF») igual ao que o Storage tem:
 * ligada se existe ao menos um documento da categoria `venda`, confirmado e fora da
 * lixeira; desligada se não sobrou nenhum.
 *
 * Por que o servidor e não o cliente: em `mock` a tela chamava `completarProcesso` e
 * marcava `pdf` junto do envio; em `http` nenhuma ação da API aceita `pdf` (marca
 * derivada de arquivo, não campo editável), então sem isto «Contratos sem PDF» acusaria
 * para sempre um contrato que já tem o arquivo.
 *
 * Deriva do estado dos documentos em vez de «ligar no confirmar, desligar no apagar»:
 * o incremental erra na primeira vez que uma das duas escritas falha ou que duas abas
 * apagam documentos ao mesmo tempo, e fica errado até alguém olhar. Relendo, a
 * próxima operação sobre qualquer documento da venda conserta o que a anterior deixou.
 *
 * A escrita sobe a `versao` do processo e é condicionada à lida, como toda ação de venda.
 * Se outra aba gravou no intervalo, relê e recalcula (a marca é idempotente e não
 * depende do resto do agregado) em vez de devolver 409 para quem só mandou um arquivo.
 * Alternativa descartada: gravar `pdf` sem subir a versão — a aba que carregou o
 * processo antes passaria a gravar de volta o `pdf` velho.
 *
 * Não é transação: o documento e o processo são duas escritas. Quem chama trata a falha
 * desta como log, nunca como erro da requisição (o arquivo já foi aceito).
 */
const TENTATIVAS = 3

export async function sincronizarPdfDaVenda(db: SupabaseClient, tenantId: string, vendaId: string): Promise<void> {
  for (let i = 0; i < TENTATIVAS; i++) {
    // Escopo só por tenant: quem chama já provou que o membro enxerga o processo
    // (`carregarAlvoVisivel`), e a marca vale para o processo, não para quem enviou.
    const venda = await buscarVenda(db, { tenantId }, vendaId)
    if (!venda) return
    const docs = await listarDocumentosDoAlvo(db, tenantId, { tipo: 'venda', id: vendaId })
    const deveTer = docs.some((d) => d.categoria === 'venda' && !d.apagado)
    if (venda.processo.pdf === deveTer) return
    const r = await gravarVenda(
      db,
      tenantId,
      { ...venda, versao: venda.versao + 1, processo: { ...venda.processo, pdf: deveTer } },
      venda.versao,
    )
    if (r === 'ok') return
  }
  throw new Error('conflito de versão persistente ao marcar o PDF do contrato')
}

/** Documento de contrato de venda: o único que mexe na marca. */
export const afetaPdfDaVenda = (d: { alvoTipo: string; categoria: string }): boolean => d.alvoTipo === 'venda' && d.categoria === 'venda'

/** Chamada pelos fluxos de documento: o arquivo já foi aceito, então falha aqui vira log. */
export async function marcarPdfSeContrato(
  db: SupabaseClient,
  tenantId: string,
  d: { alvoTipo: string; categoria: string; processoId: string },
): Promise<void> {
  if (!afetaPdfDaVenda(d)) return
  try {
    await sincronizarPdfDaVenda(db, tenantId, d.processoId)
  } catch (e) {
    logError('gestao.venda.pdf_falhou', { tenantId, vendaId: d.processoId, motivo: errMessage(e) })
  }
}
