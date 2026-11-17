import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

/**
 * RG e certidão num bucket que alguém abra por engano é vazamento de dado
 * pessoal sensível. As travas leem o SQL SEM comentários: comentar o `revoke`
 * é a mutação mais barata e, lida com comentário, passaria verde (lição de
 * `cobranca-migration-guardrail`).
 */
const SQL = readFileSync(join(process.cwd(), 'supabase', 'migrations', '0061_gestao_documentos.sql'), 'utf8').replace(
  /--[^\n]*/g,
  '',
)

describe('0061 — documentos do gestão', () => {
  test('tabela: RLS ligada, sem grant e sem policy para anon/authenticated', () => {
    expect(SQL).toMatch(/alter table public\.gestao_documentos enable row level security/)
    expect(SQL).toMatch(/revoke all on public\.gestao_documentos from anon/)
    expect(SQL).toMatch(/revoke all on public\.gestao_documentos from authenticated/)
    expect(SQL).not.toMatch(/create policy/)
    expect(SQL).not.toMatch(/grant\s/i)
  })

  test('tenant_id obrigatório e com FK; estado e alvo fechados por check', () => {
    expect(SQL).toMatch(/tenant_id\s+uuid not null references public\.tenants\(id\)/)
    expect(SQL).toMatch(/check \(alvo_tipo in \('venda', 'locacao'\)\)/)
    expect(SQL).toMatch(/check \(estado in \('pendente', 'enviado', 'conferido'\)\)/)
  })

  test('bucket privado, 15 MB, quatro formatos — e reaplicar corrige um bucket que ficou público', () => {
    expect(SQL).toMatch(/'gestao-docs', 'gestao-docs', false,/)
    expect(SQL).toMatch(/15 \* 1024 \* 1024/)
    expect(SQL).toMatch(/array\['application\/pdf', 'image\/jpeg', 'image\/png', 'image\/webp'\]/)
    // `on conflict do update` reafirma public = false: com `do nothing` um bucket criado
    // público à mão continuaria público depois da migration.
    expect(SQL).toMatch(/on conflict \(id\) do update[\s\S]*public = false/)
  })

  test('nenhuma policy em storage.objects para o bucket', () => {
    expect(SQL).not.toMatch(/storage\.objects/)
  })

  test('rollback existe e remove tabela e bucket', () => {
    const rb = readFileSync(join(process.cwd(), 'supabase', 'migrations', 'rollback', '0061_rollback.sql'), 'utf8')
    expect(rb).toMatch(/drop table if exists public\.gestao_documentos/)
    expect(rb).toMatch(/delete from storage\.buckets where id = 'gestao-docs'/)
  })
})
