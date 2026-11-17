import type { SupabaseClient } from '@supabase/supabase-js'
import type { ConsultaFeita } from '~~/layers/gestao/domain/consulta'
import { COLUNAS_CONSULTA, toConsultaModel } from '~~/server/mappers/gestao-consulta'

/**
 * `gestao_consultas` (0063). Service role, sem RLS para salvar: `tenant_id` em toda
 * query. Client sem o tipo `Database` pelo mesmo motivo do repository de locações.
 */

/** Limite de lista da fase. */
export const LIMITE_LISTA = 200

function falha(error: { message?: string } | null, o: string): never {
  throw createError({ statusCode: 500, statusMessage: `Falha ao ${o} consultas.`, message: error?.message })
}

export async function listarConsultas(db: SupabaseClient, tenantId: string): Promise<ConsultaFeita[]> {
  const { data, error } = await db
    .from('gestao_consultas')
    .select(COLUNAS_CONSULTA)
    .eq('tenant_id', tenantId)
    .order('quando', { ascending: false })
    .limit(LIMITE_LISTA)
  if (error) falha(error, 'listar')
  const feitas: ConsultaFeita[] = []
  for (const row of (data ?? []) as unknown[]) {
    try {
      feitas.push(toConsultaModel(row))
    } catch {
      // Linha corrompida não derruba o histórico do tenant; só o id vai ao log.
      logError('gestao.consulta_invalida', { tenant: tenantId, id: (row as { id?: string })?.id })
    }
  }
  return feitas
}

/** Maior id do tenant (`C-NNNN`), para numerar a próxima. Texto ordena certo enquanto tiver 4 dígitos. */
export async function ultimoIdConsulta(db: SupabaseClient, tenantId: string): Promise<string | null> {
  const { data, error } = await db
    .from('gestao_consultas')
    .select('id')
    .eq('tenant_id', tenantId)
    .order('id', { ascending: false })
    .limit(1)
  if (error) falha(error, 'numerar')
  return ((data ?? []) as { id: string }[])[0]?.id ?? null
}

/** `'duplicada'` = outro pedido pegou o mesmo número. `quando` é o relógio do banco, não do cliente. */
export async function inserirConsulta(
  db: SupabaseClient,
  tenantId: string,
  c: ConsultaFeita,
  ator: { userId: string },
): Promise<'ok' | 'duplicada'> {
  const { error } = await db.from('gestao_consultas').insert({
    tenant_id: tenantId,
    id: c.id,
    documento_mascarado: c.documentoMascarado,
    tipo: c.tipo,
    finalidade: c.finalidade,
    contrato_id: c.contratoId,
    ator_user_id: ator.userId,
    ator_nome: c.quem,
    situacao: c.situacao,
    score: c.score,
    restricoes: c.restricoes,
    simulada: true,
  })
  if ((error as { code?: string } | null)?.code === '23505') return 'duplicada'
  if (error) falha(error, 'gravar')
  return 'ok'
}
