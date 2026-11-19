import type { SupabaseClient } from '@supabase/supabase-js'
import type { MatrizPermissoes, Perfil } from '~~/layers/gestao/domain/types'
import type { AlvoTipo } from '~~/server/utils/gestao-documento-regras'

/**
 * O pedaço do `ContextoGestao` (F1, `gestao-auth.ts`) que a visibilidade usa.
 * Estrutural de propósito: o `ContextoGestao` real é atribuível a isto, e este
 * módulo não importa a F1 — dá para testar e tipar sem ela.
 */
export interface CtxAlvo {
  membro: { tenantId: string; brokerId: string | null; perfil: Perfil }
  matriz: MatrizPermissoes
  db: SupabaseClient
}

const TABELA: Record<AlvoTipo, string> = { venda: 'gestao_vendas', locacao: 'gestao_locacoes' }

/** `verTodos = sim` vê o tenant inteiro; `proprio` (padrão do corretor) vê só o que é seu. */
export function veTodos(ctx: CtxAlvo): boolean {
  return ctx.matriz.verTodos?.[ctx.membro.perfil] === 'sim'
}

/**
 * Quem enxerga arquivados é quem tem o menu «Arquivados» (`menuVisivel`): arquivar OU apagar
 * documento. É a mesma regra da lista e do GET da locação (`veArquivadas`) e da venda.
 */
export function veArquivados(ctx: Pick<CtxAlvo, 'membro' | 'matriz'>): boolean {
  return ctx.matriz.arquivar?.[ctx.membro.perfil] === 'sim' || ctx.matriz.apagarDocs?.[ctx.membro.perfil] === 'sim'
}

export interface AlvoVisivel {
  tipo: AlvoTipo
  id: string
  corretorId: string
}

const NAO_ENCONTRADO = { statusCode: 404, statusMessage: 'Não encontrado.' } as const

/**
 * Carrega a venda ou locação, e só se QUEM PERGUNTA pode vê-la.
 *
 * Lê a tabela do agregado direto (colunas de escopo, nunca o `dados jsonb`):
 * é de lá que sai o `corretor_id`, e a F2/F4 é dona da escrita, não da regra de
 * visibilidade dos documentos.
 *
 * Tudo que não é visível — id inexistente, de outro tenant, de outro corretor,
 * arquivado para quem não vê arquivados — dá o MESMO 404. 403 contaria ao corretor A que o processo do corretor B existe.
 */
export async function carregarAlvoVisivel(ctx: CtxAlvo, tipo: AlvoTipo, id: string): Promise<AlvoVisivel> {
  let q = ctx.db
    .from(TABELA[tipo])
    .select('id, corretor_id, arquivado')
    .eq('tenant_id', ctx.membro.tenantId)
    .eq('id', id)
  if (!veTodos(ctx)) {
    // Corretor sem vínculo com `brokers` não é «dono» de nada: nega, não vê tudo.
    if (!ctx.membro.brokerId) throw createError(NAO_ENCONTRADO)
    q = q.eq('corretor_id', ctx.membro.brokerId)
  }
  const { data, error } = await q.maybeSingle()
  if (error) throw error
  if (!data) throw createError(NAO_ENCONTRADO)
  const row = data as { id: string; corretor_id: string; arquivado?: boolean | null }
  // Arquivado some para quem não vê arquivados, como no GET do agregado: listar ou baixar os
  // documentos de um processo que o GET devolve 404 seria um caminho lateral para o mesmo dado.
  if (row.arquivado && !veArquivados(ctx)) throw createError(NAO_ENCONTRADO)
  return { tipo, id: row.id, corretorId: row.corretor_id }
}

/**
 * Ids que quem pergunta enxerga, por tipo — para a lixeira, que lista sem alvo.
 * `null` = tudo (`verTodos`). Limite de 200 por tipo, como as listas da fase.
 */
export async function idsAlvosVisiveis(ctx: CtxAlvo): Promise<{ venda: string[]; locacao: string[] } | null> {
  if (veTodos(ctx)) return null
  if (!ctx.membro.brokerId) return { venda: [], locacao: [] }
  const ler = async (tipo: AlvoTipo): Promise<string[]> => {
    const { data, error } = await ctx.db
      .from(TABELA[tipo])
      .select('id')
      .eq('tenant_id', ctx.membro.tenantId)
      .eq('corretor_id', ctx.membro.brokerId!)
      .order('updated_at', { ascending: false })
      .limit(200)
    if (error) throw error
    return ((data ?? []) as { id: string }[]).map((r) => r.id)
  }
  return { venda: await ler('venda'), locacao: await ler('locacao') }
}
