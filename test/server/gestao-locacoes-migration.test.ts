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

/** 0064: a FK composta é o que impede, no banco, o vínculo com corretor/imóvel de outro tenant. */
describe('migration 0064_gestao_locacoes_fk_tenant', () => {
  const m = readFileSync(join(process.cwd(), 'supabase', 'migrations', '0064_gestao_locacoes_fk_tenant.sql'), 'utf8').replace(/--.*$/gm, '')
  const rb = readFileSync(join(process.cwd(), 'supabase', 'migrations', 'rollback', '0064_rollback.sql'), 'utf8').replace(/--.*$/gm, '')

  test('corretor e imóvel só valem dentro do mesmo tenant, e o vínculo some sem zerar o tenant', () => {
    expect(m).toMatch(/foreign key \(corretor_id, tenant_id\) references public\.brokers \(id, tenant_id\) on delete set null \(corretor_id\)/)
    expect(m).toMatch(/foreign key \(imovel_id, tenant_id\) references public\.properties \(id, tenant_id\) on delete set null \(imovel_id\)/)
  })

  test('o alvo da FK tem o unique que ela exige, e tudo é idempotente', () => {
    expect(m).toMatch(/create unique index if not exists properties_id_tenant_idx on public\.properties \(id, tenant_id\)/)
    expect(m).toMatch(/create unique index if not exists brokers_id_tenant_idx/)
    for (const x of m.matchAll(/add constraint (\w+)/g)) expect(m).toContain(`drop constraint if exists ${x[1]}`)
  })

  test('o rollback devolve as FKs simples', () => {
    expect(rb).toMatch(/gestao_locacoes_corretor_id_fkey foreign key \(corretor_id\) references public\.brokers \(id\)/)
    expect(rb).toMatch(/gestao_locacoes_imovel_id_fkey foreign key \(imovel_id\) references public\.properties \(id\)/)
  })
})
