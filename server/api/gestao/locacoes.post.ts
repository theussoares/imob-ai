import { abrir } from '~~/server/utils/gestao-locacao-servico'

/** Abre uma locação. Tenant, corretor (se perfil corretor) e ator vêm da sessão, nunca do corpo. */
export default defineEventHandler(async (event) => {
  const ctx = await requireGestaoMember(event)
  const criada = await abrir(ctx, await readBody(event))
  setResponseStatus(event, 201)
  return criada
})
