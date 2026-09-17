import { listContractsForClient } from '~~/server/repositories/contract.repository'

/**
 * Os contratos em que ESTE cliente é parte.
 *
 * Lê pelo client do próprio cliente (o que `requirePortalUser` devolve), não
 * por service role: a RLS da 0028 já responde "quais contratos são desta
 * pessoa?", e usar o token dela faz o banco aplicar a regra junto com o código.
 * Service role aqui trocaria duas barreiras por uma.
 *
 * A resposta é `ContractForClient`, nunca `Contract` — ver a nota no mapper
 * sobre por que o objeto é montado do zero.
 */
export default defineEventHandler(async (event) => {
  const { client, tenant, portalUserId } = await requirePortalUser(event)
  return listContractsForClient(client, tenant.id, portalUserId)
})
