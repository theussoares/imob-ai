import { readdirSync, readFileSync } from 'node:fs'
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
const MIGRATIONS = join(process.cwd(), 'supabase/migrations')

/**
 * As colunas liberadas ao `anon` somando a 0047 (que fecha a tabela e abre a
 * lista base) com toda migration POSTERIOR que acrescenta colunas com
 * `grant select (...) on public.tenants to anon` — como a 0049, dos temas.
 * Ler só a 0047 obrigaria a reescrevê-la a cada coluna nova, e migration
 * aplicada em produção não se reescreve.
 */
function colunasDoGrant(): string[] {
  const arquivos = readdirSync(MIGRATIONS)
    .filter((n) => /^\d{4}_.*\.sql$/.test(n) && n >= '0047')
    .sort()
  const colunas = new Set<string>()
  for (const nome of arquivos) {
    const sql = readFileSync(join(MIGRATIONS, nome), 'utf8').replace(/--.*$/gm, '')
    for (const m of sql.matchAll(/grant\s+select\s*\(([^)]*)\)\s*on\s+public\.tenants\s+to\s+anon/gi)) {
      for (const c of m[1]!.split(',')) if (c.trim()) colunas.add(c.trim())
    }
  }
  if (!colunas.size) throw new Error('grant select (...) on public.tenants to anon não encontrado a partir da 0047')
  return [...colunas]
}

describe('colunas públicas de tenants', () => {
  test('os grants da 0047 em diante somam exatamente TENANT_PUBLIC_COLUMNS', () => {
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
