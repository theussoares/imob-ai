import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

/**
 * O painel de Gestão é recurso por imobiliária (0056), não mais só a variável
 * de ambiente. O risco é o inverso do das outras flags: aqui o erro silencioso
 * é ABRIR /gestao para um tenant que não tem o recurso.
 *
 * Travas que leem o fonte, como `cobranca-por-tenant.test.ts`.
 */
function fonte(...partes: string[]): string {
  return readFileSync(join(process.cwd(), ...partes), 'utf8')
}

describe('gestão segue o recurso', () => {
  test('a constraint da 0056 mantém os recursos que já existiam', () => {
    expect(fonte('supabase', 'migrations', '0056_recurso_gestao.sql')).toContain(
      "check (feature in ('portal', 'about', 'ai', 'crm', 'cobranca', 'gestao'))",
    )
  })

  test('o rollback tira as linhas ANTES de reapertar a constraint', () => {
    const sql = fonte('supabase', 'migrations', 'rollback', '0056_rollback.sql')
    expect(sql.indexOf("delete from public.tenant_features where feature = 'gestao'")).toBeGreaterThan(-1)
    expect(sql.indexOf('delete from')).toBeLessThan(sql.indexOf('add constraint'))
  })

  test('o endpoint lê o tenant do domínio e passa pela leitura única de entitlement', () => {
    const rota = fonte('server', 'api', 'recursos', 'gestao.get.ts')
    expect(rota).toContain('useTenantContext(event)')
    expect(rota).toContain('gestaoAtiva(tenant.id)')
    expect(rota).not.toContain('tenant_features')
  })

  test('a guarda de /gestao pergunta ao servidor, com o Host repassado, e falha fechado', () => {
    const guarda = fonte('layers', 'gestao', 'app', 'middleware', 'gestao.ts')
    expect(guarda).toContain("useRequestFetch()<{ ativo: boolean }>('/api/recursos/gestao')")
    expect(guarda).toMatch(/catch \{\s*return false/)
  })
})
