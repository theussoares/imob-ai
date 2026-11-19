import { requireGestaoMember, valorPermissao } from '~~/server/utils/gestao-auth'
import { regraRemoverMembro } from '~~/server/utils/gestao-membros'
import { buscarRegistroMembro, contarDonosAtivos, removerMembro } from '~~/server/repositories/gestao-member.repository'
import { registrarEvento } from '~~/server/repositories/gestao-evento.repository'

/**
 * Tira o acesso de alguém, ou cancela um convite pendente.
 *
 * Cancelar convite é de quem convida (`convidar`); tirar o acesso de quem já
 * entrou é de quem administra (`admin`) — o Jurídico convida, mas não remove a
 * equipe. O id vem da URL e é buscado DENTRO do tenant: id de outra imobiliária
 * é 404, como o que não existe.
 *
 * O corte é imediato: `requireGestaoMember` procura o vínculo a cada requisição.
 */
export default defineEventHandler(async (event) => {
  const ctx = await requireGestaoMember(event)
  const id = idDeRota(getRouterParam(event, 'id'), 'Usuário')

  const alvo = await buscarRegistroMembro(ctx.db, ctx.tenant.id, id)
  if (!alvo) throw createError({ statusCode: 404, statusMessage: 'Usuário não encontrado.' })

  if (valorPermissao(ctx, alvo.userId ? 'admin' : 'convidar') !== 'sim') {
    throw createError({ statusCode: 403, statusMessage: 'Seu perfil não tem permissão para isso.' })
  }
  const donosAtivos = alvo.perfil === 'dono' ? await contarDonosAtivos(ctx.db, ctx.tenant.id) : 0
  const erro = regraRemoverMembro({ ator: ctx.membro, alvo, donosAtivos })
  if (erro) throw createError({ statusCode: 409, statusMessage: erro })

  await removerMembro(ctx.db, ctx.tenant.id, alvo)
  await registrarEvento(ctx.db, ctx.tenant.id, {
    atorUserId: ctx.membro.userId,
    atorNome: ctx.membro.nome,
    acao: alvo.userId ? 'Removeu o acesso' : 'Cancelou o convite',
    alvoTipo: 'membro',
    alvoId: alvo.id,
  })
  return { ok: true as const }
})
