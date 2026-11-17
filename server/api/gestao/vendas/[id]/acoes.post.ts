import { executarAcaoVenda, idDeVenda } from '~~/server/utils/gestao-vendas'
import { lerSettings } from '~~/server/repositories/gestao-settings.repository'
import { registrarEvento } from '~~/server/repositories/gestao-evento.repository'

/**
 * `POST { acao, dados }` — carrega o processo, checa a permissão da ação, roda a
 * função pura do domínio e grava com `versao` (409 se outra pessoa gravou antes).
 * O corpo nunca traz tenant, ator nem data.
 */
export default defineEventHandler(async (event) => {
  const ctx = await requireGestaoMember(event)
  const id = idDeVenda(getRouterParam(event, 'id'))
  const corpo = await readBody(event)
  return executarAcaoVenda(ctx, id, corpo, {
    registrarEvento,
    comissaoPadrao: async (db, tenantId) => (await lerSettings(db, tenantId)).config.comissaoPct,
  })
})
