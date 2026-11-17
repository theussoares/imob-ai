import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~~/shared/types/database.types'
import type { AlvoEvento, EventoGestao } from '~~/layers/gestao/domain/types'
import { toEventoGestao } from '~~/server/mappers/gestao-evento.mapper'

type Client = SupabaseClient<Database>

/**
 * Auditoria do painel (`gestao_eventos`, append-only por trigger na 0059).
 *
 * Autor e hora vêm de quem chama, que os tira do servidor (`ContextoGestao.membro`
 * e o relógio dele): o histórico vale como prova, e prova vinda do body não prova.
 */
export async function registrarEvento(
  db: Client,
  tenantId: string,
  e: { atorUserId: string; atorNome: string; acao: string; alvoTipo: AlvoEvento; alvoId: string },
  opcoes: { obrigatorio?: boolean } = {},
): Promise<void> {
  const { error } = await db.from('gestao_eventos').insert({
    tenant_id: tenantId,
    ator_user_id: e.atorUserId,
    ator_nome: e.atorNome,
    acao: e.acao,
    alvo_tipo: e.alvoTipo,
    alvo_id: e.alvoId,
  })
  // Por padrão não lança: quando chega aqui a ação já foi gravada, e devolver erro faria a
  // pessoa repetir a ação. A lacuna na auditoria fica gritando no log.
  // `obrigatorio` é para quando o registro é a CONDIÇÃO da ação (download de documento:
  // sem registro de quem baixou, sem URL) — aí o chamador precisa do erro para recusar.
  if (error) {
    logError('gestao.evento_falhou', { tenant: tenantId, acao: e.acao, alvo: e.alvoTipo, reason: errMessage(error) })
    if (opcoes.obrigatorio) throw error
  }
}

const DATA = /^\d{4}-\d{2}-\d{2}$/

/** Datas do filtro são dias de Brasília (sem horário de verão desde 2019). */
const inicioDoDia = (d: string) => `${d}T00:00:00-03:00`

function diaSeguinte(d: string): string {
  const t = new Date(`${d}T00:00:00Z`)
  t.setUTCDate(t.getUTCDate() + 1)
  return t.toISOString().slice(0, 10)
}

function dataDoFiltro(v: string | undefined, rotulo: string): string | null {
  if (!v) return null
  if (!DATA.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) {
    throw createError({ statusCode: 422, statusMessage: `${rotulo} inválida (use aaaa-mm-dd).` })
  }
  return v
}

/** Eventos do tenant, mais novos primeiro, no limite de 200 da fase. `de`/`ate` inclusivos. */
export async function listarEventos(
  db: Client,
  tenantId: string,
  filtro: { quem?: string; de?: string; ate?: string },
): Promise<EventoGestao[]> {
  const de = dataDoFiltro(filtro.de, 'Data inicial')
  const ate = dataDoFiltro(filtro.ate, 'Data final')

  let q = db
    .from('gestao_eventos')
    .select('id, tenant_id, ator_user_id, ator_nome, acao, alvo_tipo, alvo_id, quando')
    .eq('tenant_id', tenantId)
  if (filtro.quem) q = q.eq('ator_nome', filtro.quem)
  if (de) q = q.gte('quando', inicioDoDia(de))
  if (ate) q = q.lt('quando', inicioDoDia(diaSeguinte(ate)))

  const { data, error } = await q.order('quando', { ascending: false }).limit(200)
  if (error) throw error
  return (data ?? []).map(toEventoGestao)
}
