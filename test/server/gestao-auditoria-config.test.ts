import { describe, expect, test } from 'vitest'
import { fakeSupabase } from '../helpers/fake-supabase'
import { auditarConfig } from '~~/server/utils/gestao-auditoria-config'

const T = 'tenant-1'
const ctx = (client: unknown) => ({ db: client, tenant: { id: T }, membro: { userId: 'u1', nome: 'Dono' } }) as never

describe('auditarConfig', () => {
  // A alteração de matriz/config já foi gravada quando a auditoria roda: 500 aqui faria o Dono
  // repetir algo que valeu. Vendas, locações e documentos já logam e seguem; estes dois não.
  test('falha ao gravar o evento não derruba a resposta', async () => {
    const { client } = fakeSupabase({ gestao_eventos: { data: null, error: { message: 'boom' } } })
    await expect(auditarConfig(ctx(client), 'Alterou as permissões', 'matriz')).resolves.toBeUndefined()
  })

  test('caminho feliz grava ator, tenant e alvo do servidor', async () => {
    const { client, calls } = fakeSupabase({ gestao_eventos: { data: null, error: null } })
    await auditarConfig(ctx(client), 'Alterou as configurações', 'config')
    const ins = calls.find((c) => c.table === 'gestao_eventos' && c.method === 'insert')!.args[0]
    expect(ins).toMatchObject({ tenant_id: T, ator_user_id: 'u1', ator_nome: 'Dono', alvo_tipo: 'config', alvo_id: 'config' })
  })
})
