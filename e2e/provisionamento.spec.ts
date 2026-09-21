import { expect, test } from '@playwright/test'
import { apagarAmbiente, criarAmbiente } from './support/tenant'
import { service } from './support/supabase'

/**
 * A suíte inteira depende deste ciclo, e ele escreve no banco dos clientes
 * reais. Um teardown quebrado não aparece como falha em lugar nenhum — aparece
 * como lixo acumulando. Por isso ele é testado explicitamente, antes de
 * qualquer asserção de produto.
 */
test('o ambiente nasce completo e some por inteiro', async () => {
  const amb = await criarAmbiente()

  const sb = service()
  const { data: antes } = await sb
    .from('portal_documents')
    .select('id')
    .eq('tenant_id', amb.tenantId)
  expect(antes).toHaveLength(6)

  const { data: partes } = await sb
    .from('contract_parties')
    .select('role')
    .eq('contract_id', amb.contratoId)
  expect(partes?.map((p) => p.role).sort()).toEqual(['fiador', 'inquilino', 'proprietario'])

  await apagarAmbiente(amb.slug)

  const { data: depois } = await sb.from('tenants').select('id').eq('slug', amb.slug)
  expect(depois).toHaveLength(0)

  // Os arquivos também: o cascade não os leva, e esquecer disso só apareceria
  // meses depois, como bucket crescendo sem motivo.
  //
  // Sem o `?? []`, de propósito: `list()` devolve `{ data: null, error }` em
  // falha, e `sobrou ?? []` virava `[]` — o teste passava afirmando que o
  // bucket esvaziou sem nunca ter conseguido olhar. É o único fail-open que
  // existia neste arquivo; as outras asserções acima recebem `data` cru e
  // falham alto quando a consulta falha.
  const { data: sobrou, error: erroSobrou } = await sb.storage.from('portal-docs').list(amb.slug)
  expect(erroSobrou).toBeNull()
  expect(sobrou).toHaveLength(0)
})

test('a varredura recusa apagar tenant que não é de teste', async () => {
  // A guarda que separa "limpa o lixo" de "apaga um cliente".
  await expect(apagarAmbiente('demo')).rejects.toThrow(/não é tenant de teste/)
})
