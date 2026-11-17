import { abrirVendaDoMembro } from '~~/server/utils/gestao-vendas'
import { lerSettings } from '~~/server/repositories/gestao-settings.repository'
import { registrarEvento } from '~~/server/repositories/gestao-evento.repository'

/** Abre um processo de venda. Ator, data, número e % de comissão vêm do servidor. */
export default defineEventHandler(async (event) => {
  const ctx = await requireGestaoMember(event)
  exigirPermissao(ctx, 'criar')
  const corpo = await readBody(event)
  setResponseStatus(event, 201)
  return abrirVendaDoMembro(ctx, corpo, {
    registrarEvento,
    comissaoPadrao: async (db, tenantId) => (await lerSettings(db, tenantId)).config.comissaoPct,
  })
})
