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

/**
 * A 0042 corrige a integridade de tenant das FKs de estorno. Ela é arquivo
 * separado porque a 0041 já rodou em produção e não pode ser emendada — não
 * porque seja outro assunto. Para efeito de invariante de schema, 0041 e 0042
 * são a MESMA unidade, e só a asserção que precisa disso lê as duas (ver
 * `nenhuma FK dos seis blocos é de coluna única`). Todo o resto continua
 * afirmando coisas sobre a 0041 sozinha, que é onde as tabelas nascem.
 */
const SQL_0042 = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '0042_modelo_financeiro_integridade.sql'),
  'utf8',
)
const UNIDADE_DE_SCHEMA = `${SQL}\n${SQL_0042}`

const TABELAS = [
  'payout_destinations',
  'contract_charges',
  'charge_items',
  'charge_settlements',
  'owner_payouts',
  'payout_items',
] as const

/**
 * O corpo de uma `create table`, da abertura até o `);` que a fecha.
 *
 * Existe porque asserção no arquivo INTEIRO não delimita tabela: um
 * `[\s\S]*?` a partir do `create table` de A casa com uma coluna declarada em
 * B, e o teste passa a afirmar sobre a tabela errada. Foi assim que a checagem
 * de `tenant_id` deixou de valer para quem ela deveria proteger.
 */
function bloco(sql: string, tabela: string): string {
  return sql.split(`create table if not exists public.${tabela}`)[1]?.split(');')[0] ?? ''
}

describe('0041 — toda tabela nasce fechada', () => {
  for (const t of TABELAS) {
    test(`${t}: existe, tem tenant_id e RLS`, () => {
      expect(SQL).toContain(`create table if not exists public.${t}`)
      expect(bloco(SQL, t), `${t} precisa de tenant_id não nulo`).toMatch(/tenant_id uuid not null/)
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

/**
 * Toda referência declarada dentro de um bloco de `create table`, nas duas
 * formas que o Postgres aceita, com a informação de se ela leva `tenant_id`.
 *
 * Comentário é removido antes: o modelo financeiro comenta muito, e um `--`
 * falando de outra tabela não pode virar FK aos olhos do teste.
 */
function referencias(corpo: string) {
  const sem = corpo.replace(/--[^\n]*/g, '')
  const achadas: { coluna: string, alvo: string, composta: boolean }[] = []

  // No nível da coluna (`conta_id uuid references public.contas(id)`). Esta
  // forma é single-column por definição: o Postgres não aceita par aqui.
  for (const m of sem.matchAll(/^\s*([a-z_]+)\s+uuid[^,\n]*?references\s+public\.([a-z_]+)\s*\(\s*id\s*\)/gm)) {
    achadas.push({ coluna: m[1]!, alvo: m[2]!, composta: false })
  }

  // No nível da tabela (`foreign key (...) references public.contas (...)`).
  for (const m of sem.matchAll(/foreign key\s*\(([^)]*)\)\s*references\s+public\.([a-z_]+)\s*\(([^)]*)\)/g)) {
    const origem = m[1]!.split(',').map(c => c.trim())
    const destino = m[3]!.split(',').map(c => c.trim())
    achadas.push({
      coluna: origem[0]!,
      alvo: m[2]!,
      composta: origem.includes('tenant_id') && destino.includes('tenant_id'),
    })
  }

  return achadas
}

describe('0041 — integridade de tenant entre pai e filha', () => {
  for (const t of TABELAS) {
    test(`${t}: declara FK composta para o pai`, () => {
      // Sem ela, uma linha poderia ter tenant_id de A apontando para pai de B —
      // e a invariante nº 1 do repositório cairia dentro da própria tabela
      // escrita para respeitá-la.
      //
      // As SEIS, e não só as três filhas óbvias: a lista curta deixava de fora
      // justamente as que atravessam para tabelas pré-existentes
      // (`contracts`, `portal_users`), onde rebaixar a FK para coluna única é
      // SQL válido e ninguém acusaria.
      expect(bloco(SQL, t)).toMatch(/foreign key \([a-z_]+_id, tenant_id\) references/)
    })
  }

  test('nenhuma FK dos seis blocos é de coluna única', () => {
    // INVARIANTE, não lista de quais FKs devem ser compostas. A lista já ficou
    // incompleta uma vez, e o custo de esquecer um nome nela é uma FK que
    // atravessa tenant sem ninguém notar. Aqui é o contrário: FK nova nasce
    // reprovada até provar que leva `tenant_id`.
    //
    // Única exceção, e ela é estrutural: `public.tenants(id)` é a raiz da
    // árvore — não existe `tenants.tenant_id` para compor.
    //
    // ⚠️ Lê 0041 + 0042 concatenadas. As três FKs de estorno nascem de coluna
    // única no texto da 0041 e só viram compostas na 0042, que existe porque a
    // 0041 já rodou em produção e não pode ser emendada. Ler só a 0041 aqui
    // faria o invariante reprovar um schema que está certo no banco.
    for (const t of TABELAS) {
      for (const { coluna, alvo, composta } of referencias(bloco(SQL, t))) {
        if (alvo === 'tenants' || composta) continue

        expect(
          UNIDADE_DE_SCHEMA,
          `${t}.${coluna} referencia ${alvo} sem tenant_id e nada promove a FK`,
        ).toMatch(
          new RegExp(
            `foreign key \\(${coluna}, tenant_id\\)\\s*references\\s+public\\.${alvo}\\s*\\(\\s*id,\\s*tenant_id\\s*\\)`,
          ),
        )
      }
    }
  })

  test('todo alvo de FK composta tem unique em (id, tenant_id)', () => {
    // Também invariante: varre os alvos que as FKs compostas declaram e cobra o
    // unique de cada um, em vez de repetir uma lista de nomes.
    //
    // Duas formas satisfazem, e as duas precisam valer: `unique (id, tenant_id)`
    // inline (as seis tabelas novas) ou `create unique index` explícito
    // (`contracts` e `portal_users`, pré-existentes, que a 0041 não reescreve).
    // Exigir só o índice explícito seria exigir de volta os três que a 0042
    // derruba por serem duplicata do índice que o unique inline já cria.
    const alvos = new Set<string>()
    for (const t of TABELAS) {
      for (const { alvo, composta } of referencias(bloco(SQL, t))) {
        if (composta) alvos.add(alvo)
      }
    }
    expect(alvos.size).toBeGreaterThan(0)

    for (const alvo of alvos) {
      const inline = bloco(UNIDADE_DE_SCHEMA, alvo).includes('unique (id, tenant_id)')
      const indice = new RegExp(
        `create unique index if not exists[^;]*on public\\.${alvo} \\(id, tenant_id\\)`,
      ).test(UNIDADE_DE_SCHEMA)
      expect(inline || indice, `${alvo} é alvo de FK composta e não tem unique (id, tenant_id)`).toBe(true)
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

  // Por tabela, e não no arquivo inteiro: as duas declaram `idempotency_key`, e
  // uma asserção global era satisfeita por qualquer uma das duas. Tirar o
  // `unique` só de `owner_payouts` — o caso "webhook de repasse reenviado paga
  // duas vezes numa conta bancária real" — passava no teste.
  for (const t of ['charge_settlements', 'owner_payouts']) {
    test(`${t}: a chave de idempotência é única`, () => {
      expect(bloco(SQL, t)).toMatch(/idempotency_key text unique/)
    })
  }

  test('as linhas de valor não têm updated_at', () => {
    // Append-only: correção é linha nova apontando para a que estorna.
    for (const t of ['charge_items', 'charge_settlements', 'payout_items']) {
      const corpo = bloco(SQL, t)
      expect(corpo, `${t} não pode ter updated_at`).not.toContain('updated_at')
      expect(corpo).toMatch(/reverses_[a-z]+_id uuid/)
    }
  })

  test('competence carrega o aviso de que é mês de ocupação', () => {
    // Quem confundir com o mês do vencimento não quebra a aplicação: quebra o
    // DIMOB e o informe de rendimentos, sem erro em tempo de execução.
    expect(SQL).toMatch(/competence[\s\S]{0,200}ocupa/i)
  })
})
