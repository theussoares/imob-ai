import { exigirPermissao, requireGestaoMember } from '~~/server/utils/gestao-auth'
import { validarConfigPedido } from '~~/server/utils/gestao-membros'
import { gravarConfig } from '~~/server/repositories/gestao-settings.repository'
import { registrarEvento } from '~~/server/repositories/gestao-evento.repository'

/**
 * Salva as configurações (`admin`), validadas por `validarConfiguracoes` do
 * domínio. Padrão, não regra: contrato já aberto guarda o percentual que tinha.
 */
export default defineEventHandler(async (event) => {
  const ctx = await requireGestaoMember(event)
  exigirPermissao(ctx, 'admin')
  const body = await readBody<{ config?: unknown }>(event)

  const r = validarConfigPedido(body?.config)
  if (!r.ok) throw createError({ statusCode: 422, statusMessage: r.erro })

  await gravarConfig(ctx.db, ctx.tenant.id, r.config)
  await registrarEvento(ctx.db, ctx.tenant.id, {
    atorUserId: ctx.membro.userId,
    atorNome: ctx.membro.nome,
    acao: 'Alterou as configurações',
    alvoTipo: 'config',
    alvoId: 'config',
  })
  return { config: r.config }
})
