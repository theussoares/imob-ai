import type { SupabaseClient } from '@supabase/supabase-js'
import type { Processo } from '~~/layers/gestao/domain/types'
import { toVendaColunas, toVendaModel, type Venda, type VendaRow } from '~~/server/mappers/gestao-venda'

/**
 * Acesso a `gestao_vendas` (0060). Recebe o client por parâmetro (testável com
 * `fakeSupabase`) e devolve o agregado do mapper, nunca a row.
 *
 * Toda query leva `tenant_id`: o client é a service_role e não há RLS para
 * salvar. O escopo do corretor (`corretorId`) é filtro NO BANCO, e não depois:
 * assim o processo de outro corretor simplesmente não vem, e o chamador responde
 * 404 sem confirmar que ele existe.
 */

type Client = SupabaseClient

export const LIMITE_LISTA = 200

/** Colunas de `VendaRow`, uma a uma: coluna nova na tabela só sai depois que alguém a escreve aqui. */
const COLUNAS = 'id, tenant_id, corretor_id, status, arquivado, etapa, versao, dados, updated_at'

/** `corretorId` ausente = vê todos os corretores do tenant. */
export interface Escopo {
  tenantId: string
  corretorId?: string
}

/** Linhas → modelo. Uma linha corrompida não derruba a lista do tenant: sai do resultado, com só o id no log. */
function paraModelos(rows: VendaRow[], tenantId: string): Venda[] {
  const vendas: Venda[] = []
  for (const row of rows) {
    try {
      vendas.push(toVendaModel(row))
    } catch {
      // Sem dado da linha no log (nome e CPF das partes), só o identificador.
      logError('gestao_venda_invalida', { tenantId, id: row.id })
    }
  }
  return vendas
}

export interface FiltroVendas {
  arquivado: boolean
  /** Ausente = todos os status. Coluna própria: filtra no banco, não depois. */
  status?: string
}

function consulta(db: Client, escopo: Escopo, filtro: FiltroVendas, opcoes?: { count: 'exact'; head?: boolean }) {
  let q = db.from('gestao_vendas').select(COLUNAS, opcoes).eq('tenant_id', escopo.tenantId).eq('arquivado', filtro.arquivado)
  if (escopo.corretorId) q = q.eq('corretor_id', escopo.corretorId)
  if (filtro.status) q = q.eq('status', filtro.status)
  // `id` desempata: com `updated_at` igual a página seguinte repetiria ou pularia linhas.
  return q.order('updated_at', { ascending: false }).order('id', { ascending: false })
}

export async function listarVendas(db: Client, escopo: Escopo, filtro: FiltroVendas): Promise<Venda[]> {
  const { data, error } = await consulta(db, escopo, filtro).limit(LIMITE_LISTA)
  if (error) throw error
  return paraModelos((data ?? []) as VendaRow[], escopo.tenantId)
}

/** Uma página, com o total que casa com o filtro (contagem do banco, sem trazer as linhas). */
export async function listarVendasPagina(
  db: Client,
  escopo: Escopo,
  filtro: FiltroVendas,
  pagina: number,
  porPagina: number,
): Promise<{ vendas: Venda[]; total: number }> {
  const de = (pagina - 1) * porPagina
  const { data, error, count } = await consulta(db, escopo, filtro, { count: 'exact' }).range(de, de + porPagina - 1)
  if (error) {
    // Página além do fim: o PostgREST responde 416 (PGRST103) em vez de lista vazia. A tela precisa
    // do total para ir à última página, então ele vem de uma contagem sem linhas.
    if ((error as { code?: string }).code !== 'PGRST103') throw error
    const { count: total, error: erroContagem } = await consulta(db, escopo, filtro, { count: 'exact', head: true })
    if (erroContagem) throw erroContagem
    return { vendas: [], total: total ?? 0 }
  }
  return { vendas: paraModelos((data ?? []) as VendaRow[], escopo.tenantId), total: count ?? 0 }
}

/** Teto da busca por texto: ela lê as linhas do filtro para casar nome/CPF em memória (ver `listarVendasDoMembro`). */
export const LIMITE_BUSCA = 5000
const BLOCO = 1000

/**
 * Todas as linhas do filtro, em blocos de 1000 (o PostgREST corta ali) até `LIMITE_BUSCA`. Serve à busca
 * por texto: nome e CPF moram no `jsonb` e a busca ignora acento, o que o banco não faz sem extensão
 * nova. `truncado` avisa que passou do teto.
 */
export async function listarTodasVendas(db: Client, escopo: Escopo, filtro: FiltroVendas): Promise<{ vendas: Venda[]; truncado: boolean }> {
  const rows: VendaRow[] = []
  for (let de = 0; de < LIMITE_BUSCA; de += BLOCO) {
    const { data, error } = await consulta(db, escopo, filtro).range(de, de + BLOCO - 1)
    if (error) throw error
    const bloco = (data ?? []) as VendaRow[]
    rows.push(...bloco)
    if (bloco.length < BLOCO) return { vendas: paraModelos(rows, escopo.tenantId), truncado: false }
  }
  return { vendas: paraModelos(rows, escopo.tenantId), truncado: true }
}

export async function buscarVenda(db: Client, escopo: Escopo, id: string): Promise<Venda | null> {
  let q = db.from('gestao_vendas').select(COLUNAS).eq('tenant_id', escopo.tenantId).eq('id', id)
  if (escopo.corretorId) q = q.eq('corretor_id', escopo.corretorId)
  const { data, error } = await q.maybeSingle()
  if (error) throw error
  return data ? toVendaModel(data as VendaRow) : null
}

/**
 * O maior id já usado no ano, para `proximoId` do domínio escolher o seguinte.
 *
 * Só o maior (`order desc` + `limit 1`): listar todos esbarra no corte de 1000 linhas
 * do PostgREST, e com mais de 1000 vendas no ano o «próximo número» seria calculado
 * sobre um subconjunto arbitrário — repetia um id existente, a PK recusava, e a abertura
 * devolvia 409 para sempre. A ordem é textual: vale enquanto o sufixo tem 4 dígitos
 * (`V-AAAA-9999`); o domínio preenche com zeros, então passa de 9999 vendas/ano só
 * com decisão nova.
 */
export async function idsDoAno(db: Client, tenantId: string, ano: number): Promise<string[]> {
  const { data, error } = await db
    .from('gestao_vendas')
    .select('id')
    .eq('tenant_id', tenantId)
    .like('id', `V-${ano}-%`)
    .order('id', { ascending: false })
    .limit(1)
  if (error) throw error
  return ((data ?? []) as { id: string }[]).map((r) => r.id)
}

/** Quais destes corretores pertencem ao tenant (valida o que o cliente mandou). */
export async function corretoresDoTenant(db: Client, tenantId: string, ids: string[]): Promise<Set<string>> {
  const unicos = [...new Set(ids)]
  if (!unicos.length) return new Set()
  const { data, error } = await db.from('brokers').select('id').eq('tenant_id', tenantId).in('id', unicos)
  if (error) throw error
  return new Set(((data ?? []) as { id: string }[]).map((r) => r.id))
}

/** Insere o processo novo. `'duplicado'` = o id foi tomado por outra abertura simultânea. */
export async function inserirVenda(db: Client, tenantId: string, p: Processo): Promise<'ok' | 'duplicado'> {
  const { error } = await db
    .from('gestao_vendas')
    .insert({ id: p.id, tenant_id: tenantId, versao: 1, ...toVendaColunas(p) })
  if (!error) return 'ok'
  if ((error as { code?: string }).code === '23505') return 'duplicado'
  throw error
}

/**
 * Grava com concorrência otimista: só atualiza se a versão ainda é a que foi
 * lida. Zero linhas atingidas = outra pessoa gravou antes → 'conflito', e nada
 * é sobrescrito.
 */
export async function gravarVenda(
  db: Client,
  tenantId: string,
  novo: Venda,
  versaoAnterior: number,
): Promise<'ok' | 'conflito'> {
  const { data, error } = await db
    .from('gestao_vendas')
    .update({ versao: novo.versao, updated_at: new Date().toISOString(), ...toVendaColunas(novo.processo) })
    .eq('tenant_id', tenantId)
    .eq('id', novo.id)
    .eq('versao', versaoAnterior)
    .select('id')
  if (error) throw error
  return (data ?? []).length > 0 ? 'ok' : 'conflito'
}
