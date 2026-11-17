import type { SupabaseClient } from '@supabase/supabase-js'
import type { Locacao } from '~~/layers/gestao/domain/types'
import {
  toLocacaoModel,
  toLocacaoRow,
  type GestaoLocacaoRow,
  type LocacaoVersionada,
} from '~~/server/mappers/gestao-locacao'

/**
 * `gestao_locacoes` (0062) e as leituras que a locação precisa de tabelas vizinhas.
 *
 * Client sem o tipo `Database`: `shared/types/database.types.ts` é gerado do banco
 * e esta tabela só passa a existir nele depois que a migration for aplicada. O
 * schema Zod do mapper faz o papel do tipo.
 *
 * Toda query leva `tenant_id` no where: o client é a service role e não há RLS
 * para salvar (CLAUDE.md, invariante 2). Colunas sempre listadas, nunca `*`.
 */

const COLUNAS = 'tenant_id, id, corretor_id, imovel_id, status, arquivado, etapa, versao, dados, updated_at'

/** Limite fixo por lista nesta fase (spec do backend). */
export const LIMITE_LISTA = 200

export interface FiltroLocacoes {
  /** true = só arquivadas; false = só as ativas */
  arquivadas: boolean
  /** Presente = escopo do corretor («só os meus»). */
  corretorId?: string | null
}

function falha(error: { message?: string } | null, o: string): never {
  throw createError({ statusCode: 500, statusMessage: `Falha ao ${o} locações.`, message: error?.message })
}

export async function listarLocacoes(db: SupabaseClient, tenantId: string, filtro: FiltroLocacoes): Promise<LocacaoVersionada[]> {
  // Corretor sem vínculo (`brokerId` nulo) não tem «os meus»: lista vazia, e não a
  // lista de todos por esquecimento do filtro.
  if (filtro.corretorId === null) return []
  let q = db.from('gestao_locacoes').select(COLUNAS).eq('tenant_id', tenantId).eq('arquivado', filtro.arquivadas)
  if (filtro.corretorId) q = q.eq('corretor_id', filtro.corretorId)
  const { data, error } = await q.order('updated_at', { ascending: false }).limit(LIMITE_LISTA)
  if (error) falha(error, 'listar')
  return ((data ?? []) as GestaoLocacaoRow[]).map(toLocacaoModel)
}

/**
 * `corretorId` presente restringe ao corretor: o id de outro corretor volta `null`,
 * igual a um id que não existe — a resposta não revela que a locação existe.
 */
export async function buscarLocacao(
  db: SupabaseClient,
  tenantId: string,
  id: string,
  escopo: { corretorId?: string | null } = {},
): Promise<LocacaoVersionada | null> {
  if (escopo.corretorId === null) return null
  let q = db.from('gestao_locacoes').select(COLUNAS).eq('tenant_id', tenantId).eq('id', id)
  if (escopo.corretorId) q = q.eq('corretor_id', escopo.corretorId)
  const { data, error } = await q.maybeSingle()
  if (error) falha(error, 'buscar')
  return data ? toLocacaoModel(data as GestaoLocacaoRow) : null
}

/**
 * Maior id do ano, para numerar a próxima abertura (`L-AAAA-NNNN`). Ordena o texto:
 * correto enquanto o número tiver 4 dígitos; passando de 9999 locações num ano por
 * imobiliária isto precisa virar coluna numérica.
 */
export async function ultimoIdDoAno(db: SupabaseClient, tenantId: string, ano: number): Promise<string | null> {
  const { data, error } = await db
    .from('gestao_locacoes')
    .select('id')
    .eq('tenant_id', tenantId)
    .ilike('id', `L-${ano}-%`)
    .order('id', { ascending: false })
    .limit(1)
  if (error) falha(error, 'numerar')
  return ((data ?? []) as { id: string }[])[0]?.id ?? null
}

/** Insere a locação nova (versão 1). `'duplicada'` = outro request pegou o mesmo número. */
export async function inserirLocacao(db: SupabaseClient, tenantId: string, locacao: Locacao): Promise<'ok' | 'duplicada'> {
  const { error } = await db.from('gestao_locacoes').insert({ ...toLocacaoRow(locacao, tenantId), versao: 1 })
  if ((error as { code?: string } | null)?.code === '23505') return 'duplicada'
  if (error) falha(error, 'criar')
  return 'ok'
}

/**
 * Grava com concorrência otimista: o `where versao = $anterior` faz quem chegou
 * depois não achar linha para atualizar, e o `select()` final é o que mostra isso
 * (sem ele o PostgREST devolve sucesso com zero linhas afetadas).
 */
export async function gravarLocacao(
  db: SupabaseClient,
  tenantId: string,
  locacao: Locacao,
  versaoAnterior: number,
): Promise<'ok' | 'conflito'> {
  // `tenant_id` e `id` ficam fora do SET: a chave não muda e o tenant não é regravado.
  const { tenant_id: _t, id: _i, ...campos } = toLocacaoRow(locacao, tenantId)
  const { data, error } = await db
    .from('gestao_locacoes')
    .update({ ...campos, versao: versaoAnterior + 1, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('id', locacao.id)
    .eq('versao', versaoAnterior)
    .select('id')
  if (error) falha(error, 'gravar')
  return ((data ?? []) as unknown[]).length ? 'ok' : 'conflito'
}

/** O corretor existe NESTA imobiliária? Impede apontar a locação para o corretor de outro cliente. */
export async function corretorDoTenant(db: SupabaseClient, tenantId: string, corretorId: string): Promise<boolean> {
  const { data, error } = await db.from('brokers').select('id').eq('tenant_id', tenantId).eq('id', corretorId).maybeSingle()
  if (error) falha(error, 'validar o corretor das')
  return !!data
}

/** O imóvel existe NESTA imobiliária? Mesma razão: `imovelId` vem do corpo da requisição. */
export async function imovelDoTenant(db: SupabaseClient, tenantId: string, imovelId: string): Promise<boolean> {
  const { data, error } = await db.from('properties').select('id').eq('tenant_id', tenantId).eq('id', imovelId).maybeSingle()
  if (error) falha(error, 'validar o imóvel das')
  return !!data
}

/**
 * Locações em andamento do imóvel (não encerradas e não arquivadas): a regra
 * «não excluir imóvel com locação ativa». O filtro roda no banco, com o mesmo
 * critério de `situacaoImovel` do domínio. Linha ilegível propaga o erro em vez
 * de ser ignorada: o guarda de exclusão falha fechado (500), nunca aberto.
 */
export async function locacoesAtivasDoImovel(db: SupabaseClient, tenantId: string, imovelId: string): Promise<Locacao[]> {
  const { data, error } = await db
    .from('gestao_locacoes')
    .select(COLUNAS)
    .eq('tenant_id', tenantId)
    .eq('imovel_id', imovelId)
    .eq('arquivado', false)
    .neq('status', 'Encerrada')
  if (error) falha(error, 'consultar')
  return ((data ?? []) as GestaoLocacaoRow[]).map((r) => toLocacaoModel(r).locacao)
}
