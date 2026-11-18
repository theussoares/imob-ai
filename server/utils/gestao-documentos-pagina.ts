import { paginarDocumentos, type AbaDocumentos, type FiltroCategoria, type PaginaDocumentos } from '~~/layers/gestao/domain/documentos'
import { listarDocumentosDeVendas } from '~~/server/repositories/gestao-documento.repository'
import { listarTodasVendas } from '~~/server/repositories/gestao-venda.repository'
import { exigirPermissao, type ContextoGestao } from '~~/server/utils/gestao-auth'
import { escopoDe } from '~~/server/utils/gestao-vendas'

/**
 * Página da tela «Documentos» (abas Documentos, Lixeira e Contratos sem PDF).
 *
 * A tela filtra por nome do documento, id e IMÓVEL do processo, sem acento; o imóvel mora no `jsonb` da
 * venda e a lixeira/aba precisam da contagem das três abas, então o servidor lê os processos visíveis e
 * os documentos deles (até 5000 de cada) e aplica as MESMAS funções de domínio da tela
 * (`paginarDocumentos`): o que o mock mostra é o que o servidor mostra.
 * Alternativa descartada: paginar no banco — exigiria junção entre `gestao_documentos` e o `jsonb` da
 * venda (migration nova) só para filtrar por imóvel. Custo: a leitura cresce com a carteira, não com a página.
 */

export interface FiltroPaginaDocumentos {
  aba: AbaDocumentos
  categoria: FiltroCategoria
  q: string
  /** Restringe a UM processo (`?processo=`). */
  processo: string | null
  pagina: number
}

export type RespostaDocumentos = PaginaDocumentos

export async function paginaDeDocumentos(ctx: ContextoGestao, f: FiltroPaginaDocumentos): Promise<RespostaDocumentos> {
  // A lixeira é de quem apaga documento, como o endpoint da lixeira; sem a permissão nem a contagem vai.
  const podeLixeira = ctx.matriz.apagarDocs?.[ctx.membro.perfil] === 'sim'
  if (f.aba === 'lixeira' && !podeLixeira) exigirPermissao(ctx, 'apagarDocs')

  const tenantId = ctx.membro.tenantId
  const { vendas, truncado: vendasTruncado } = await listarTodasVendas(ctx.db, escopoDe(ctx), { arquivado: false })
  const processos = vendas.map((v) => v.processo)
  const visiveis = new Set(processos.map((p) => p.id))

  // Só documentos de processo visível: corretor lê os dos seus ids; quem vê tudo lê o tenant e o domínio descarta
  // o que for de processo arquivado. Com `?processo=`, o único id pedido (se não for visível, o domínio esvazia).
  const ids = f.processo ? [f.processo] : ctx.matriz.verTodos?.[ctx.membro.perfil] === 'sim' ? null : [...visiveis]
  const { docs, truncado: docsTruncado } = await listarDocumentosDeVendas(ctx.db, tenantId, ids)

  return { ...paginarDocumentos(docs, processos, { ...f, processo: f.processo ?? '' }, { podeApagar: podeLixeira }), truncado: vendasTruncado || docsTruncado }
}
