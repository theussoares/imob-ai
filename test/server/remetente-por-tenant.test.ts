import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

const MIGRATION = join(
  process.cwd(),
  'supabase',
  'migrations',
  '0038_tenant_mail_sender.sql',
)

describe('a tabela do remetente não é gravável pela imobiliária', () => {
  /**
   * Os dois domínios estão verificados na MESMA conta Resend, então quem
   * controla o endereço de envio manda e-mail como o outro cliente — com SPF e
   * DKIM passando. É pior que phishing comum, porque autentica.
   */
  /**
   * Só as instruções, sem os comentários.
   *
   * O cabeçalho da migration cita `for all` de propósito — é ele que explica
   * por que uma policy dessas entregaria o remetente à própria imobiliária.
   * Afirmar sobre o arquivo cru faria o teste exigir que a armadilha não
   * fosse documentada.
   */
  const sql = () =>
    readFileSync(MIGRATION, 'utf8')
      .split('\n')
      .filter((linha) => !linha.trim().startsWith('--'))
      .join('\n')

  test('a única policy é de leitura', () => {
    const fonte = sql()
    expect(fonte).toContain('for select to authenticated')
    // `for all` é o padrão de quase todas as outras tabelas deste schema, e é
    // exatamente por isso que o teste existe: acrescentar uma aqui, por hábito,
    // abriria a escrita sem ninguém ter decidido isso.
    expect(fonte).not.toContain('for all')
    expect(fonte).not.toMatch(/for (insert|update|delete)/)
  })

  test('o revoke é explícito, não implícito', () => {
    // A 0036 já registrou o porquê: sem o revoke, a proteção depende de ninguém
    // acrescentar uma policy permissiva depois. Não há erro e não há sintoma.
    const fonte = sql()
    expect(fonte).toContain('revoke insert, update, delete, truncate on public.tenant_mail_sender from authenticated')
    expect(fonte).toContain('revoke all on public.tenant_mail_sender from anon')
  })

  test('é idempotente', () => {
    const fonte = sql()
    expect(fonte).toContain('create table if not exists')
    expect(fonte).toContain('drop policy if exists')
  })
})
