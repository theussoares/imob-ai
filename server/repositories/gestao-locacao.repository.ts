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
  /** Ausente = todos os status. */
  status?: string
}

function falha(error: { message?: string } | null, o: string): never {
  throw createError({ statusCode: 500, statusMessage: `Falha ao ${o} locações.`, message: error?.message })
}

function consulta(db: SupabaseClient, tenantId: string, filtro: FiltroLocacoes, opcoes?: { count: 'exact'; head?: boolean }) {
  let q = db.from('gestao_locacoes').select(COLUNAS, opcoes).eq('tenant_id', tenantId).eq('arquivado', filtro.arquivadas)
  if (filtro.corretorId) q = q.eq('corretor_id', filtro.corretorId)
  if (filtro.status) q = q.eq('status', filtro.status)
  // `id` desempata: com `updated_at` igual a página seguinte repetiria ou pularia linhas.
  return q.order('updated_at', { ascending: false }).order('id', { ascending: false })
}

export async function listarLocacoes(db: SupabaseClient, tenantId: string, filtro: FiltroLocacoes): Promise<LocacaoVersionada[]> {
  // Corretor sem vínculo (`brokerId` nulo) não tem «os meus»: lista vazia, e não a
  // lista de todos por esquecimento do filtro.
  if (filtro.corretorId === null) return []
  const { data, error } = await consulta(db, tenantId, filtro).limit(LIMITE_LISTA)
  if (error) falha(error, 'listar')
  return ((data ?? []) as GestaoLocacaoRow[]).map(toLocacaoModel)
}

/** Uma página, com o total que casa com o filtro (contagem do banco). */
export async function listarLocacoesPagina(
  db: SupabaseClient,
  tenantId: string,
  filtro: FiltroLocacoes,
  pagina: number,
  porPagina: number,
): Promise<{ locacoes: LocacaoVersionada[]; total: number }> {
  if (filtro.corretorId === null) return { locacoes: [], total: 0 }
  const de = (pagina - 1) * porPagina
  const { data, error, count } = await consulta(db, tenantId, filtro, { count: 'exact' }).range(de, de + porPagina - 1)
  if (error) {
    // Página além do fim: o PostgREST responde 416 (PGRST103) em vez de lista vazia; o total vem de uma contagem sem linhas.
    if ((error as { code?: string }).code !== 'PGRST103') falha(error, 'listar')
    const { count: total, error: erroContagem } = await consulta(db, tenantId, filtro, { count: 'exact', head: true })
    if (erroContagem) falha(erroContagem, 'listar')
    return { locacoes: [], total: total ?? 0 }
  }
  return { locacoes: ((data ?? []) as GestaoLocacaoRow[]).map(toLocacaoModel), total: count ?? 0 }
}

/**
 * Locações por status sob o MESMO escopo da lista (tenant, arquivadas, corretor), sem o filtro de status.
 * Contagem exata do banco por status, em paralelo: ler as linhas esbarraria no corte de 1000 do PostgREST.
 * `corretorId === null` (corretor sem vínculo) não vê nenhuma, como em `listarLocacoes`.
 */
export async function contarLocacoesPorStatus(
  db: SupabaseClient,
  tenantId: string,
  filtro: Omit<FiltroLocacoes, 'status'>,
  statusValidos: readonly string[],
): Promise<Record<string, number>> {
  if (filtro.corretorId === null) return Object.fromEntries(statusValidos.map((s) => [s, 0]))
  const pares = await Promise.all(
    statusValidos.map(async (status) => {
      const { count, error } = await consulta(db, tenantId, { ...filtro, status }, { count: 'exact', head: true })
      if (error) falha(error, 'listar')
      return [status, count ?? 0] as const
    }),
  )
  return Object.fromEntries(pares)
}

/** Teto e bloco da busca por texto: mesma razão de `listarTodasVendas`. */
export const LIMITE_BUSCA = 5000
const BLOCO = 1000

export async function listarTodasLocacoes(
  db: SupabaseClient,
  tenantId: string,
  filtro: FiltroLocacoes,
): Promise<{ locacoes: LocacaoVersionada[]; truncado: boolean }> {
  if (filtro.corretorId === null) return { locacoes: [], truncado: false }
  const rows: GestaoLocacaoRow[] = []
  for (let de = 0; de < LIMITE_BUSCA; de += BLOCO) {
    const { data, error } = await consulta(db, tenantId, filtro).range(de, de + BLOCO - 1)
    if (error) falha(error, 'listar')
    const bloco = (data ?? []) as GestaoLocacaoRow[]
    rows.push(...bloco)
    if (bloco.length < BLOCO) return { locacoes: rows.map(toLocacaoModel), truncado: false }
  }
  return { locacoes: rows.map(toLocacaoModel), truncado: true }
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
