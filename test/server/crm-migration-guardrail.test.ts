import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

/**
 * Invariantes da 0049 travadas por leitura do SQL (mesmo padrão de
 * `financeiro-guardrail.test.ts`). Cada asserção parte de um recorte nomeado —
 * um comando inteiro — e não do arquivo todo: âncora solta casa com a linha
 * errada e passa verde medindo outra coisa.
 */
const SQL = readFileSync(join(process.cwd(), 'supabase/migrations/0049_crm_historico_agenda_roleta.sql'), 'utf8')
  .replace(/--.*$/gm, '')

/** Comandos SQL inteiros (até o `;`), sem os corpos de função `$$ ... $$`. */
const COMANDOS = SQL.replace(/\$\$[\s\S]*?\$\$/g, '$$').split(';').map((c) => c.replace(/\s+/g, ' ').trim())

const comando = (re: RegExp) => COMANDOS.filter((c) => re.test(c))

describe('0049: histórico append-only', () => {
  test('nenhuma policy de update/delete em lead_events', () => {
    const policies = comando(/^create policy .* on public\.lead_events/)
    expect(policies.length).toBe(2)
    for (const p of policies) expect(p).toMatch(/ for (select|insert) /)
  })

  test('o grant de update/delete é retirado do authenticated — a policy sozinha não basta', () => {
    expect(comando(/^revoke update, delete, truncate on public\.lead_events from authenticated$/)).toHaveLength(1)
  })
})

describe('0049: anon fora das tabelas novas', () => {
  test.each(['lead_events', 'lead_tasks'])('%s: RLS ligada e revoke all do anon', (t) => {
    expect(comando(new RegExp(`^alter table public\\.${t} enable row level security$`))).toHaveLength(1)
    expect(comando(new RegExp(`^revoke all on public\\.${t} from anon$`))).toHaveLength(1)
  })

  test('toda policy nova exige ser membro do tenant da linha', () => {
    for (const p of comando(/^create policy .* on public\.lead_(events|tasks)/)) {
      expect(p).toMatch(/is_tenant_member\(tenant_id\)/)
      expect(p).toMatch(/ to authenticated /)
    }
  })
})

describe('0049: tenant amarrado nas referências', () => {
  test('lead, imóvel e corretor da tarefa são FK COMPOSTA com tenant_id', () => {
    const tabela = comando(/^create table if not exists public\.lead_tasks/)[0]!
    for (const pai of ['leads', 'properties', 'brokers']) {
      expect(tabela).toMatch(new RegExp(`foreign key \\(\\w+, tenant_id\\) references public\\.${pai} \\(id, tenant_id\\)`))
    }
  })

  test('o evento só aponta para lead do mesmo tenant', () => {
    const tabela = comando(/^create table if not exists public\.lead_events/)[0]!
    expect(tabela).toMatch(/foreign key \(lead_id, tenant_id\) references public\.leads \(id, tenant_id\)/)
  })
})

describe('0049: roleta', () => {
  test('só a service_role executa — membro não gira a fila pelo /rpc', () => {
    expect(comando(/^revoke execute on function public\.proximo_corretor_da_roleta\(uuid\) from public, anon, authenticated$/)).toHaveLength(1)
    expect(comando(/^grant execute on function public\.proximo_corretor_da_roleta\(uuid\) to /)).toEqual([
      'grant execute on function public.proximo_corretor_da_roleta(uuid) to service_role',
    ])
  })

  test('escolha e marcação no mesmo update, com skip locked', () => {
    const fn = SQL.match(/function public\.proximo_corretor_da_roleta[\s\S]*?\$\$([\s\S]*?)\$\$/)![1]!
    expect(fn).toMatch(/update public\.brokers/)
    expect(fn).toMatch(/for update of c skip locked/)
    expect(fn).toMatch(/lead_distribution = 'roleta'/)
  })

  test('lead_distribution fica fora do grant por coluna do anon', () => {
    expect(SQL).not.toMatch(/grant select[^;]*lead_distribution/)
  })
})
