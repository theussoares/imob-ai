import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

/** 0062: tabela com dado financeiro — só a service role chega nela. */
const sql = readFileSync(join(process.cwd(), 'supabase', 'migrations', '0062_gestao_locacoes.sql'), 'utf8')
const semComentario = sql.replace(/--.*$/gm, '')

describe('migration 0062_gestao_locacoes', () => {
  test('RLS ligada, revoke de anon/authenticated e nenhuma policy', () => {
    expect(semComentario).toContain('alter table public.gestao_locacoes enable row level security')
    expect(semComentario).toMatch(/revoke all on public\.gestao_locacoes from anon, authenticated/)
    expect(semComentario).not.toMatch(/create policy/i)
    expect(semComentario).not.toMatch(/grant /i)
  })

  test('chave por tenant e versão para concorrência otimista', () => {
    expect(semComentario).toMatch(/primary key \(tenant_id, id\)/)
    expect(semComentario).toMatch(/versao integer not null default 1/)
  })

  test('idempotente: tudo com if not exists', () => {
    expect(semComentario).toMatch(/create table if not exists public\.gestao_locacoes/)
    for (const m of semComentario.matchAll(/create index (?!if not exists)/g)) throw new Error(`índice sem if not exists: ${m[0]}`)
  })

  test('o imóvel que sai do catálogo não apaga a locação', () => {
    expect(semComentario).toMatch(/imovel_id uuid references public\.properties\(id\) on delete set null/)
  })
})
