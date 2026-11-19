import { requireGestaoMember } from '~~/server/utils/gestao-auth'

/** Matriz de permissões do tenant. Qualquer membro lê: é ela que monta o menu de cada um. */
export default defineEventHandler(async (event) => ({ matriz: (await requireGestaoMember(event)).matriz }))
