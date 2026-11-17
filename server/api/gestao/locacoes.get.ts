import { listar } from '~~/server/utils/gestao-locacao-servico'

/** Locações visíveis ao membro (corretor: só as suas). `?arquivadas=1` exige poder ver arquivados. */
export default defineEventHandler(async (event) => {
  const ctx = await requireGestaoMember(event)
  const arquivadas = getQuery(event).arquivadas === '1'
  return { locacoes: await listar(ctx, arquivadas) }
})
