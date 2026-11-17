import { agir, idDeLocacao } from '~~/server/utils/gestao-locacao-servico'

/**
 * `{ acao, dados, versao }`: roda a função pura do domínio sobre a locação carregada
 * e grava com concorrência otimista. `versao` é a que a tela leu; defasada → 409.
 */
export default defineEventHandler(async (event) => {
  const ctx = await requireGestaoMember(event)
  return agir(ctx, idDeLocacao(getRouterParam(event, 'id')), await readBody(event))
})
