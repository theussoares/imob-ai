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
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'ID inválido.' })

  const contrato = await getContract(client, tenant.id, id)
  if (!contrato) throw createError({ statusCode: 404, statusMessage: 'Contrato não encontrado.' })

  const [internal, partes] = await Promise.all([
    getContractInternal(client, id),
    listContractParties(client, tenant.id, id),
  ])

  return { contrato, internal, partes }
})
