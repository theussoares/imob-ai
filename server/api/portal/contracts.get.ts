import { listContractsForClient } from '~~/server/repositories/contract.repository'

/**
 * Os contratos do cliente logado.
 *
 * O escopo NÃO vem da URL nem do corpo — vem do `portalUserId` que
 * `requirePortalUser` devolve. Não existe parâmetro para pedir "os contratos de
 * outra pessoa", e é por isso que este handler cabe em cinco linhas.
 *
 * Responde com `ContractForClient`, que não tem `tenantId`, `propertyId` nem
 * `source`. Os campos internos (`notes`, `admin_fee_percent`, `external_id`)
 * moram em outra tabela e não são alcançados por nenhuma chamada daqui.
 *
 * Roda com o client do próprio cliente (token dele), então a RLS continua valendo
 * por baixo — diferente dos endpoints de imóvel do painel, que precisaram de
 * service role por causa das colunas internas. Aqui não há esse motivo, e manter
 * a RLS de pé é a segunda barreira.
 */
export default defineEventHandler(async (event) => {
  const { client, portalUserId } = await requirePortalUser(event)
  return await listContractsForClient(client, portalUserId)
})
