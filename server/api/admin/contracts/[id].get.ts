import { portalUsersWithActiveDestination } from '~~/server/repositories/payout-destination.repository'
import {
  getContract,
  getContractInternal,
  listContractParties,
} from '~~/server/repositories/contract.repository'

/**
 * Um contrato com tudo que a tela de edição precisa.
 *
 * Devolve `internal` num campo próprio, em vez de mesclar com o contrato: a
 * separação existe no banco (tabela `contract_internal`) justamente para que
 * "o que o cliente vê" e "o que é da imobiliária" não morem no mesmo objeto, e
 * achatar aqui desfaria isso no caminho de volta.
 */
export default defineEventHandler(async (event) => {
  const { client, tenant } = await requireTenantMember(event)
  const id = idDeRota(getRouterParam(event, 'id'))

  const contrato = await getContract(client, tenant.id, id)
  if (!contrato) throw createError({ statusCode: 404, statusMessage: 'Contrato não encontrado.' })

  const [internal, partes] = await Promise.all([
    getContractInternal(client, id),
    listContractParties(client, tenant.id, id),
  ])
  // Só o SIM/NÃO de ter destino de repasse, para a pendência da ficha. O dado
  // bancário em si não volta para a tela depois de gravado.
  const comRepasse = await portalUsersWithActiveDestination(
    client,
    tenant.id,
    partes.filter((p) => p.role === 'proprietario').map((p) => p.portalUserId),
  )

  return { contrato, internal, partes, repasseInformado: partes.some((p) => comRepasse.has(p.portalUserId)) }
})
