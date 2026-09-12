import type { ContractSavePayload } from '~~/shared/models/portal'
import { createContract, upsertContractInternal } from '~~/server/repositories/contract.repository'

/**
 * Cria um contrato.
 *
 * O `tenant.id` vem de `requireTenantMember` e nunca do body — aceitar tenant do
 * request deixaria um membro de painel cadastrar contrato na imobiliária alheia.
 *
 * Os campos internos são gravados numa SEGUNDA chamada, em `contract_internal`.
 * Não é transação: se a segunda falhar, o contrato existe sem a taxa de
 * administração e a tela mostra o erro para a pessoa salvar de novo. O contrário
 * — perder o contrato inteiro porque a anotação falhou — seria pior, e o campo
 * interno não é o que o cliente enxerga.
 */
export default defineEventHandler(async (event) => {
  const { client, tenant } = await requireTenantMember(event)
  const body = await readBody<ContractSavePayload>(event)
  assertContractInput(body)

  const contract = await createContract(client, tenant.id, body)
  if (body.internal) {
    await upsertContractInternal(client, tenant.id, contract.id, body.internal)
  }
  return contract
})
