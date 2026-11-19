import { PERFIS } from '~~/layers/gestao/domain/permissions'
import { exigirPermissao, requireGestaoMember } from '~~/server/utils/gestao-auth'
import { perfilECorretorDoPedido, regraAlterarMembro } from '~~/server/utils/gestao-membros'
import {
  alterarMembro,
  buscarRegistroMembro,
  contarDonosAtivos,
  corretorDoTenant,
} from '~~/server/repositories/gestao-member.repository'
import { registrarEvento } from '~~/server/repositories/gestao-evento.repository'
import { toMembroLista } from '~~/server/mappers/gestao-member.mapper'

/**
 * Muda o perfil (e o corretor) de alguém. Só quem administra (`admin`). As travas
 * que a matriz não expressa — a si mesmo, o perfil Dono, o último Dono — moram em
 * `regraAlterarMembro`.
 */
export default defineEventHandler(async (event) => {
  const ctx = await requireGestaoMember(event)
  exigirPermissao(ctx, 'admin')
  const id = idDeRota(getRouterParam(event, 'id'), 'Usuário')
  const body = (await readBody<Record<string, unknown>>(event)) ?? {}
  const { perfil, brokerId } = perfilECorretorDoPedido(body)

  const alvo = await buscarRegistroMembro(ctx.db, ctx.tenant.id, id)
  if (!alvo) throw createError({ statusCode: 404, statusMessage: 'Usuário não encontrado.' })

  const donosAtivos = alvo.perfil === 'dono' ? await contarDonosAtivos(ctx.db, ctx.tenant.id) : 0
  const erro = regraAlterarMembro({ ator: ctx.membro, alvo, novoPerfil: perfil, donosAtivos })
  if (erro) throw createError({ statusCode: 409, statusMessage: erro })
  if (brokerId && !(await corretorDoTenant(ctx.db, ctx.tenant.id, brokerId))) {
    throw createError({ statusCode: 422, statusMessage: 'Corretor não encontrado.' })
  }

  const atualizado = await alterarMembro(ctx.db, ctx.tenant.id, id, { perfil, brokerId })
  if (!atualizado) throw createError({ statusCode: 404, statusMessage: 'Usuário não encontrado.' })

  await registrarEvento(ctx.db, ctx.tenant.id, {
    atorUserId: ctx.membro.userId,
    atorNome: ctx.membro.nome,
    acao: `Mudou o perfil para ${PERFIS[perfil].nome}`,
    alvoTipo: 'membro',
    alvoId: id,
  })
  return { membro: toMembroLista(atualizado, Date.now()) }
})
