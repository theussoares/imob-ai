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

/** `corretorId` ausente = vê todos os corretores do tenant. */
export interface Escopo {
  tenantId: string
  corretorId?: string
}

export async function listarVendas(
  db: Client,
  escopo: Escopo,
  filtro: { arquivado: boolean },
): Promise<Venda[]> {
  let q = db.from('gestao_vendas').select('*').eq('tenant_id', escopo.tenantId).eq('arquivado', filtro.arquivado)
  if (escopo.corretorId) q = q.eq('corretor_id', escopo.corretorId)
  const { data, error } = await q.order('updated_at', { ascending: false }).limit(LIMITE_LISTA)
  if (error) throw error
  const vendas: Venda[] = []
  for (const row of (data ?? []) as VendaRow[]) {
    try {
      vendas.push(toVendaModel(row))
    } catch {
      // Uma linha corrompida não pode derrubar a lista inteira do tenant; sem
      // dado da linha no log (nome e CPF das partes), só o identificador.
      logError('gestao_venda_invalida', { tenantId: escopo.tenantId, id: row.id })
    }
  }
  return vendas
}

export async function buscarVenda(db: Client, escopo: Escopo, id: string): Promise<Venda | null> {
  let q = db.from('gestao_vendas').select('*').eq('tenant_id', escopo.tenantId).eq('id', id)
  if (escopo.corretorId) q = q.eq('corretor_id', escopo.corretorId)
  const { data, error } = await q.maybeSingle()
  if (error) throw error
  return data ? toVendaModel(data as VendaRow) : null
}

/** Ids já usados no ano, para `proximoId` do domínio escolher o seguinte. */
export async function idsDoAno(db: Client, tenantId: string, ano: number): Promise<string[]> {
  const { data, error } = await db
    .from('gestao_vendas')
    .select('id')
    .eq('tenant_id', tenantId)
    .like('id', `V-${ano}-%`)
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
