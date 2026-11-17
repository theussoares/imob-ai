import { dashboard } from '~~/server/utils/gestao-leituras'

/** Números do painel inicial, no recorte do membro (corretor: só os contratos dele). Sem valores em R$. */
export default defineEventHandler(async (event) => {
  const ctx = await requireGestaoMember(event)
  return dashboard(ctx)
})
