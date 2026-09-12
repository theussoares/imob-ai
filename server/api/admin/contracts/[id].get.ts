import type { ContractDetail } from '~~/shared/models/portal'
import {
  getContract,
  getContractInternal,
  listContractParties,
} from '~~/server/repositories/contract.repository'

/**
 * Um contrato com tudo que a tela de edição precisa.
 *
 * As três leituras ficam separadas de propósito — cada uma já confere o tenant
 * por conta própria, e `getContractInternal` existe como função distinta
 * justamente para que nenhum handler de portal a alcance por descuido. Aqui é o
 * painel: é o único lugar onde as três se juntam.
 */
export default defineEventHandler(async (event): Promise<ContractDetail> => {
  const { client, tenant } = await requireTenantMember(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'ID inválido.' })

  const contract = await getContract(client, tenant.id, id)
  if (!contract) throw createError({ statusCode: 404, statusMessage: 'Contrato não encontrado.' })

  const [internal, parties] = await Promise.all([
    getContractInternal(client, tenant.id, id),
    listContractParties(client, tenant.id, id),
  ])

  return { contract, internal, parties }
})
