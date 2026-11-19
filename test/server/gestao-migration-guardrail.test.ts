import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { stripComments } from '../helpers/strip-comments'

/**
 * Invariantes das tabelas `gestao_*` (0059 em diante), por leitura do SQL — o mesmo
 * padrão de `crm-migration-guardrail.test.ts`.
 *
 * A decisão da spec é que o painel de gestão só fala com o banco pelo servidor
 * (`serviceSupabase()` + `tenant_id` no where). A ameaça: a anon key vai no HTML de
 * toda página, e o Supabase dá GRANT default a `anon` e `authenticated` em tabela
 * nova. Uma tabela `gestao_*` que esquecesse o `revoke` ficaria legível pelo
 * `/rest/v1` para qualquer usuário logado em QUALQUER imobiliária — RG, CPF, código
 * do 2º fator. Por isso o teste varre TODA migration ≥ 0059: a tabela da F2, F3, F4
 * cai aqui por padrão, sem ninguém lembrar de listá-la.
 */
const DIR = join(process.cwd(), 'supabase/migrations')
const ARQUIVOS = readdirSync(DIR).filter((f) => /^\d{4}_.*\.sql$/.test(f) && Number(f.slice(0, 4)) >= 59)

const semComentarios = (sql: string) => sql.replace(/--.*$/gm, '')
const comandosDe = (sql: string) =>
  semComentarios(sql)
    .replace(/\$\$[\s\S]*?\$\$/g, '$$')
    .split(';')
    .map((c) => c.replace(/\s+/g, ' ').trim().toLowerCase())

const TODOS = ARQUIVOS.flatMap((f) => comandosDe(readFileSync(join(DIR, f), 'utf8')))
const TABELAS = [...new Set(TODOS.flatMap((c) => c.match(/^create table if not exists public\.(gestao_\w+)/)?.[1] ?? []))]

const SQL_0059 = semComentarios(readFileSync(join(DIR, '0059_gestao_acesso.sql'), 'utf8')).toLowerCase()
const C59 = comandosDe(readFileSync(join(DIR, '0059_gestao_acesso.sql'), 'utf8'))
const tabela = (nome: string) => C59.find((c) => c.startsWith(`create table if not exists public.${nome} `))!

describe('gestão: todas as tabelas fechadas para anon e authenticated', () => {
  test('a 0059 cria as seis tabelas da fundação', () => {
    for (const t of ['gestao_members', 'gestao_otp', 'gestao_sessions', 'gestao_settings', 'gestao_eventos', 'gestao_login_falhas']) {
      expect(TABELAS).toContain(t)
    }
  })

  test.each(TABELAS)('%s: RLS ligada e revoke all de anon e authenticated', (t) => {
    expect(TODOS).toContain(`alter table public.${t} enable row level security`)
    expect(TODOS).toContain(`revoke all on public.${t} from anon, authenticated`)
  })

  test('nenhuma policy em tabela gestao_*: o acesso é só pelo servidor', () => {
    expect(TODOS.filter((c) => /^create policy .* on public\.gestao_/.test(c))).toEqual([])
  })

  test('nenhum grant para anon ou authenticated em tabela gestao_*', () => {
    expect(TODOS.filter((c) => /^grant .* on (table )?public\.gestao_\w+ to .*(anon|authenticated)/.test(c))).toEqual([])
  })
})

describe('0059: membros', () => {
  test('um vínculo por usuário e um por e-mail em cada tenant', () => {
    expect(SQL_0059).toMatch(/unique index if not exists \w+ on public\.gestao_members \(tenant_id, user_id\)/)
    expect(SQL_0059).toMatch(/unique index if not exists \w+ on public\.gestao_members \(tenant_id, lower\(email\)\)/)
  })

  test('perfil fechado nos quatro, e corretor exige corretor cadastrado', () => {
    const t = tabela('gestao_members')
    expect(t).toContain("check (perfil in ('corretor', 'recepcao', 'juridico', 'dono'))")
    expect(t).toContain("check (perfil <> 'corretor' or broker_id is not null)")
  })

  test('o corretor ligado é do MESMO tenant (FK composta)', () => {
    expect(tabela('gestao_members')).toMatch(/foreign key \(broker_id, tenant_id\) references public\.brokers \(id, tenant_id\)/)
  })
})

describe('0059: auditoria append-only', () => {
  test('trigger recusa update e delete em gestao_eventos', () => {
    expect(SQL_0059).toMatch(/before update or delete on public\.gestao_eventos/)
    const fn = SQL_0059.match(/function public\.gestao_eventos_append_only\(\)[\s\S]*?\$\$([\s\S]*?)\$\$/)![1]!
    expect(fn).toMatch(/raise exception/)
  })

  test('o autor do evento não é FK para auth.users: apagar a conta não pode apagar a auditoria', () => {
    expect(tabela('gestao_eventos')).not.toMatch(/ator_user_id uuid[^,]*references/)
  })
})

describe('0059: 2º fator', () => {
  test('o código é guardado só como hash', () => {
    const t = tabela('gestao_otp')
    expect(t).toContain('code_hash text not null')
    expect(t).not.toMatch(/\bcode text\b|\bcodigo\b/)
  })

  test('sessão verificada é por session_id do JWT, amarrada a tenant e usuário', () => {
    const t = tabela('gestao_sessions')
    expect(t).toContain('primary key (session_id, tenant_id)')
    expect(t).toMatch(/tenant_id uuid not null/)
    expect(t).toMatch(/user_id uuid not null/)
  })
})

/**
 * Lado da aplicação. Com as tabelas fechadas para anon/authenticated, quem lê é a
 * service_role, que enxerga tudo: a proteção passa a ser o código (CLAUDE.md,
 * invariante 3). Estas varreduras pegam a F2…F7 também, sem ninguém lembrar.
 */
function arquivosTs(dir: string, acc: string[] = []): string[] {
  for (const nome of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, nome.name)
    if (nome.isDirectory()) arquivosTs(p, acc)
    else if (nome.name.endsWith('.ts')) acc.push(p)
  }
  return acc
}
const SERVER = arquivosTs(join(process.cwd(), 'server'))
const rel = (f: string) => f.slice(f.indexOf('server/'))

describe('gestão: acesso às tabelas pelo código', () => {
  test('tabela gestao_* só é tocada pelos repositories do gestão', () => {
    const fora = SERVER.filter((f) => /\.from\(['"]gestao_/.test(stripComments(readFileSync(f, 'utf8'))))
      .map(rel)
      .filter((f) => !/^server\/repositories\/gestao-[\w-]+\.repository\.ts$/.test(f))
    expect(fora).toEqual([])
  })

  test("nenhum select('*') nos repositories do gestão: coluna nova não sai sem alguém escrevê-la", () => {
    const comEstrela = SERVER.filter((f) => /^server\/repositories\/gestao-/.test(rel(f)))
      .filter((f) => /\.select\(\s*['"]\*['"]/.test(stripComments(readFileSync(f, 'utf8'))))
      .map(rel)
    expect(comEstrela).toEqual([])
  })

  /**
   * Os únicos endpoints do /api/gestao sem sessão: quem ainda não entrou precisa
   * abrir o convite, aceitá-lo e fazer login. Entrar nesta lista é um ato
   * consciente que aparece na revisão. O código e o reenvio usam `acessoGestao`
   * (sem o 2º fator, que é o que eles cumprem).
   */
  // `renovar` e `sair` se autenticam pelo cookie HttpOnly do refresh token (não há Bearer válido no F5);
  // `renovar` ainda confere que o usuário é membro deste tenant, e o token que devolve só abre algo
  // depois do 2º fator (`requireGestaoMember`). `sair` nunca falha e não devolve dado.
  const PUBLICOS = [
    'server/api/gestao/auth/convite/[token].get.ts',
    'server/api/gestao/auth/aceitar.post.ts',
    'server/api/gestao/auth/login.post.ts',
    'server/api/gestao/auth/renovar.post.ts',
    'server/api/gestao/auth/sair.post.ts',
  ]

  test('todo endpoint do /api/gestao passa pela autenticação do gestão', () => {
    const endpoints = SERVER.filter((f) => rel(f).startsWith('server/api/gestao/'))
    expect(endpoints.length).toBeGreaterThan(10)
    const sem = endpoints
      .filter((f) => !PUBLICOS.includes(rel(f)))
      .filter((f) => !/\b(requireGestaoMember|acessoGestao)\(event/.test(stripComments(readFileSync(f, 'utf8'))))
      .map(rel)
    expect(sem).toEqual([])
  })

  test('os públicos ainda conferem o recurso gestao do tenant', () => {
    // `sair` fica de fora de propósito: com o recurso desligado o usuário ainda precisa conseguir
    // apagar o cookie; ela não lê nem devolve dado do tenant.
    for (const f of PUBLICOS.filter((p) => !p.endsWith('/sair.post.ts'))) {
      expect(stripComments(readFileSync(join(process.cwd(), f), 'utf8')), f).toContain('gestaoAtiva(tenant.id)')
    }
  })

  test('nenhum endpoint do gestão lê tenant_id do body', () => {
    const lendo = SERVER.filter((f) => rel(f).startsWith('server/api/gestao/'))
      .filter((f) => /body\??\.(tenantId|tenant_id)|tenantId:\s*body/.test(stripComments(readFileSync(f, 'utf8'))))
      .map(rel)
    expect(lendo).toEqual([])
  })
})
