import { requireGestaoMember, valorPermissao } from '~~/server/utils/gestao-auth'
import { listarMembros } from '~~/server/repositories/gestao-member.repository'

/**
 * Lista de usuários e convites do painel. Quem convida (Jurídico) vê a tela, como
 * em `menuVisivel('usuarios')`; quem administra (Dono) também.
 */
export default defineEventHandler(async (event) => {
  const ctx = await requireGestaoMember(event)
  if (valorPermissao(ctx, 'convidar') !== 'sim' && valorPermissao(ctx, 'admin') !== 'sim') {
    throw createError({ statusCode: 403, statusMessage: 'Seu perfil não tem permissão para isso.' })
  }
  const lista = await listarMembros(ctx.db, ctx.tenant.id, Date.now())
  return { data: lista.map((m) => ({ ...m, voce: m.id === ctx.membro.id })) }
})
