import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { TENANT_PUBLIC_COLUMNS } from '~~/server/mappers/tenant.mapper'

/**
 * A resolução de tenant lê `tenants` com a anon key, e desde a 0047 o anon só
 * enxerga as colunas do `grant select (...)`. As duas listas precisam ser
 * iguais, e cada direção da divergência quebra de um jeito:
 *
 * - coluna no código e fora do grant: `permission denied` na resolução de
 *   tenant — todo site de todo cliente fora do ar;
 * - coluna no grant e fora do código: ela volta a ser legível pela anon key
 *   sem ninguém precisar dela, que é o vazamento que a 0047 fechou.
 *
 * O teste lê o arquivo da migration, não o banco: o que ele garante é que
 * quem mexer numa lista vê o outro lado cair na mesma revisão.
 */
function colunasDoGrant(): string[] {
  const sql = readFileSync(
    join(process.cwd(), 'supabase/migrations/0047_tenants_grant_por_coluna_anon.sql'),
    'utf8',
  )
  const semComentarios = sql.replace(/--.*$/gm, '')
  const m = semComentarios.match(/grant\s+select\s*\(([^)]*)\)\s*on\s+public\.tenants\s+to\s+anon/i)
  if (!m) throw new Error('grant select (...) on public.tenants to anon não encontrado na 0047')
  return m[1]!.split(',').map((c) => c.trim()).filter(Boolean)
}

describe('colunas públicas de tenants', () => {
  test('o grant da 0047 é exatamente TENANT_PUBLIC_COLUMNS', () => {
    expect([...colunasDoGrant()].sort()).toEqual([...TENANT_PUBLIC_COLUMNS].sort())
  })

  test('nenhuma coluna interna entra no grant', () => {
    for (const interna of ['updated_by', 'ai_tone', 'created_at', 'updated_at']) {
      expect(colunasDoGrant()).not.toContain(interna)
    }
  })

  test('o revoke da tabela vem antes do grant por coluna', () => {
    const sql = readFileSync(
      join(process.cwd(), 'supabase/migrations/0047_tenants_grant_por_coluna_anon.sql'),
      'utf8',
    ).replace(/--.*$/gm, '')
    const revoke = sql.search(/revoke\s+select\s+on\s+public\.tenants\s+from\s+anon/i)
    const grant = sql.search(/grant\s+select\s*\(/i)
    expect(revoke).toBeGreaterThanOrEqual(0)
    expect(revoke).toBeLessThan(grant)
  })
})
