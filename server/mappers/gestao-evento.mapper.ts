import type { Database } from '~~/shared/types/database.types'
import type { AlvoEvento, EventoGestao } from '~~/layers/gestao/domain/types'

type Row = Database['public']['Tables']['gestao_eventos']['Row']

export const ALVOS_EVENTO: readonly AlvoEvento[] = ['venda', 'locacao', 'documento', 'imovel', 'membro', 'config', 'consulta']

export function toEventoGestao(row: Row): EventoGestao {
  return {
    // bigint vira texto: o modelo não promete número a quem só compara e exibe.
    id: String(row.id),
    atorUserId: row.ator_user_id,
    atorNome: row.ator_nome,
    acao: row.acao,
    alvoTipo: row.alvo_tipo as AlvoEvento,
    alvoId: row.alvo_id,
    quando: row.quando,
  }
}
