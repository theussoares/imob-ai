import { exigirPermissao, requireGestaoMember } from '~~/server/utils/gestao-auth'
import { validarMatrizPedido } from '~~/server/utils/gestao-membros'
import { gravarMatriz } from '~~/server/repositories/gestao-settings.repository'
import { registrarEvento } from '~~/server/repositories/gestao-evento.repository'

/**
 * Salva a matriz de permissões (`admin`). A matriz inteira é revalidada célula a
 * célula com a regra da tela (`alterarPermissao`): é aqui que «o Dono não perde
 * `admin`» deixa de depender do botão desabilitado.
 */
export default defineEventHandler(async (event) => {
  const ctx = await requireGestaoMember(event)
  exigirPermissao(ctx, 'admin')
  const body = await readBody<{ matriz?: unknown }>(event)

  const r = validarMatrizPedido(body?.matriz)
  if (!r.ok) throw createError({ statusCode: 422, statusMessage: r.erro })

  await gravarMatriz(ctx.db, ctx.tenant.id, r.matriz)
  await registrarEvento(ctx.db, ctx.tenant.id, {
    atorUserId: ctx.membro.userId,
    atorNome: ctx.membro.nome,
    acao: 'Alterou as permissões',
    alvoTipo: 'config',
    alvoId: 'matriz',
  })
  return { matriz: r.matriz }
})
