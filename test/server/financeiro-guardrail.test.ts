import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

/**
 * As invariantes de segurança da 0041, travadas por leitura do SQL.
 *
 * Este teste não toca banco — é o mesmo padrão de
 * `public-payload-guardrail.test.ts`, e pelo mesmo motivo: a regra precisa ser
 * verificável em `pnpm test`, que roda em segundos e portanto roda sempre.
 *
 * A ameaça que ele cobre: seis tabelas novas, todas com dado interno, sendo uma
 * delas (`payout_destinations`) com dado BANCÁRIO de pessoa real, num banco
 * compartilhado por quatro imobiliárias. Esquecer um `revoke` ou um `tenant_id`
 * numa delas não quebra nada visivelmente — só abre a porta.
 */

const SQL = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '0041_modelo_financeiro.sql'),
  'utf8',
)

const TABELAS = [
  'payout_destinations',
  'contract_charges',
  'charge_items',
  'charge_settlements',
  'owner_payouts',
  'payout_items',
] as const

/** As que penduram num pai e precisam de FK composta com `tenant_id`. */
const FILHAS = ['charge_items', 'charge_settlements', 'payout_items'] as const

describe('0041 — toda tabela nasce fechada', () => {
  for (const t of TABELAS) {
    test(`${t}: existe, tem tenant_id e RLS`, () => {
      expect(SQL).toContain(`create table if not exists public.${t}`)
      expect(SQL).toMatch(
        new RegExp(`create table if not exists public\\.${t}[\\s\\S]*?tenant_id uuid not null`),
      )
      // `\s+` e não espaço único: o SQL alinha as colunas destes blocos para
      // ficarem legíveis, e um regex rígido falharia por formatação.
      expect(SQL).toMatch(new RegExp(`alter table public\\.${t}\\s+enable row level security`))
    })

    test(`${t}: revoke do anon`, () => {
      // A policy sozinha não basta: o Supabase dá GRANT default ao `anon`, e as
      // migrations 0005, 0011 e 0015 existem porque isso falhou uma vez cada.
      expect(SQL).toMatch(new RegExp(`revoke all on public\\.${t}\\s+from anon`))
    })

    test(`${t}: policy de membro`, () => {
      expect(SQL).toMatch(new RegExp(`on public\\.${t}[\\s\\S]{0,400}is_tenant_member`))
    })

    test(`${t}: índice começando por tenant_id`, () => {
      // A RLS acrescenta o predicado de tenant a toda consulta; índice que não
      // começa por ele não é usado.
      expect(SQL).toMatch(new RegExp(`create index if not exists[^;]*on public\\.${t} \\(tenant_id`))
    })
  }

  test('NENHUMA policy do portal, em nenhuma das seis', () => {
    // O cliente não lê estas tabelas na v1. Se um dia ler, a régua é
    // `portal_my_parties()` — e aí é outra migration, com sua própria revisão.
    //
    // Checagem no arquivo INTEIRO, e não por tabela: a primeira versão deste
    // teste fatiava o SQL a partir da primeira ocorrência de
    // `on public.<tabela>`, que cai num índice e não na policy — passava sem
    // testar nada.
    expect(SQL).not.toContain('portal_my_parties')
    expect(SQL).not.toContain('is_portal_user')
  })
})

describe('0041 — integridade de tenant entre pai e filha', () => {
  for (const t of FILHAS) {
    test(`${t}: FK composta com tenant_id`, () => {
      // Sem ela, uma linha poderia ter tenant_id de A apontando para pai de B —
      // e a invariante nº 1 do repositório cairia dentro da própria tabela
      // escrita para respeitá-la.
      const bloco = SQL.split(`create table if not exists public.${t}`)[1]?.split(');')[0] ?? ''
      expect(bloco).toMatch(/foreign key \([a-z_]+_id, tenant_id\) references/)
    })
  }

  test('os pais têm o unique que a FK composta exige', () => {
    for (const pai of ['contract_charges', 'owner_payouts', 'portal_users', 'contracts']) {
      expect(SQL).toMatch(new RegExp(`create unique index if not exists[^;]*on public\\.${pai} \\(id, tenant_id\\)`))
    }
  })
})

describe('0041 — o que a spec decidiu, travado', () => {
  test('listas fechadas são CHECK, não enum', () => {
    // A spec registra que as listas de `kind` podem estar erradas e precisam de
    // validação com quem opera. Corrigir CHECK é drop+create; valor de enum não
    // se remove.
    expect(SQL).not.toMatch(/create type public\.(charge|payout|settlement)/)
    expect(SQL).toMatch(/check \(kind in \(/)
  })

  test('dinheiro é numeric(12,2)', () => {
    const colunas = SQL.match(/^\s+(amount|issued_amount) [a-z0-9(),]+/gm) ?? []
    expect(colunas.length).toBeGreaterThan(0)
    for (const c of colunas) expect(c).toContain('numeric(12,2)')
  })

  test('a chave de idempotência é única', () => {
    // É o que impede um webhook reenviado de duplicar pagamento.
    expect(SQL).toMatch(/idempotency_key text unique/)
  })

  test('as linhas de valor não têm updated_at', () => {
    // Append-only: correção é linha nova apontando para a que estorna.
    for (const t of ['charge_items', 'charge_settlements', 'payout_items']) {
      const bloco = SQL.split(`create table if not exists public.${t}`)[1]?.split(');')[0] ?? ''
      expect(bloco, `${t} não pode ter updated_at`).not.toContain('updated_at')
      expect(bloco).toMatch(/reverses_[a-z]+_id uuid/)
    }
  })

  test('competence carrega o aviso de que é mês de ocupação', () => {
    // Quem confundir com o mês do vencimento não quebra a aplicação: quebra o
    // DIMOB e o informe de rendimentos, sem erro em tempo de execução.
    expect(SQL).toMatch(/competence[\s\S]{0,200}ocupa/i)
  })
})
