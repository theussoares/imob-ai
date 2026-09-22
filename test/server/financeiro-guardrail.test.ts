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
 *
 * ⚠️ Guardrail que lê texto tem um modo de falha próprio, e este arquivo já o
 * teve CINCO vezes: a âncora casa com uma linha parecida em outro lugar do
 * arquivo e a asserção passa verde medindo o texto errado. Por isso toda
 * asserção daqui para frente parte de um RECORTE nomeado (bloco de
 * `create table`, comando de `create policy`, comando de `grant`) em vez de
 * varrer o arquivo inteiro a partir de um ponto de partida qualquer. Antes de
 * dar por consertado qualquer defeito deste arquivo, prove por mutação numa
 * CÓPIA fora do repositório: se a mutação continua verde, o conserto não
 * existe.
 */

const SQL = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '0041_modelo_financeiro.sql'),
  'utf8',
)

/**
 * A 0042 corrige a integridade de tenant das FKs de estorno. Ela é arquivo
 * separado porque a 0041 já rodou em produção e não pode ser emendada — não
 * porque seja outro assunto. Para efeito de invariante de schema, 0041 e 0042
 * são a MESMA unidade, e as asserções que descrevem o estado final do banco
 * (FK promovida, policy, grant) leem as duas. As que descrevem onde a tabela
 * NASCE continuam lendo a 0041 sozinha.
 */
const SQL_0042 = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '0042_modelo_financeiro_integridade.sql'),
  'utf8',
)
const UNIDADE_DE_SCHEMA = `${SQL}\n${SQL_0042}`

/**
 * O SQL sem comentário — é dele que toda asserção estrutural lê.
 *
 * Comentar a linha com `--` é a mutação mais barata que existe, e era INVISÍVEL
 * para este arquivo: `revoke all ... from anon`, `enable row level security` e
 * `create index` continuavam casando DENTRO do comentário, os testes ficavam
 * verdes e a proteção não existia mais no banco. A técnica já estava aqui, em
 * `referencias()`; o que faltava era o resto do arquivo usá-la.
 */
function semComentarios(sql: string): string {
  return sql.replace(/--[^\n]*/g, '')
}

const SQL_SEM_COMENTARIOS = semComentarios(SQL)
const UNIDADE_SEM_COMENTARIOS = semComentarios(UNIDADE_DE_SCHEMA)

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

/**
 * Toda `create policy` do SQL, com o alvo lido do CABEÇALHO do comando
 * (`create policy <nome> on public.<tabela>`) e o corpo até o `;` que o fecha.
 *
 * Varrer `create policy` e filtrar pelo alvo, em vez de fatiar o texto a partir
 * de `on public.<tabela>`, é o conserto do pior defeito que este arquivo já
 * teve. A asserção anterior era
 * `on public\.<tabela>[\s\S]{0,400}is_tenant_member`: a PRIMEIRA ocorrência de
 * `on public.<tabela>` no arquivo é o `revoke all on public.<tabela> from
 * anon`, e dali, dentro dos 400 caracteres, ela alcançava o `is_tenant_member`
 * da policy da tabela ANTERIOR. Trocar o predicado desta tabela por `true` — ou
 * apagar a policy inteira — mantinha 39/39 verdes, provado por mutação.
 *
 * Ordem e proximidade de linha não entram na conta: o alvo sai do próprio
 * comando.
 */
function policies(sqlSemComentarios: string): { nome: string, alvo: string, corpo: string }[] {
  const achadas: { nome: string, alvo: string, corpo: string }[] = []
  const re = /create\s+policy\s+("[^"]+"|[a-z_][a-z0-9_]*)\s+on\s+(?:public\.)?([a-z_][a-z0-9_]*)[\s\S]*?;/gi
  for (const m of sqlSemComentarios.matchAll(re)) {
    achadas.push({ nome: m[1]!, alvo: m[2]!, corpo: m[0]! })
  }
  return achadas
}

/**
 * O predicado de `using (...)` ou de `with check (...)`, com os parênteses
 * balanceados.
 *
 * Contar parêntese, e não casar `\(([^)]*)\)`: o predicado legítimo é uma
 * CHAMADA (`is_tenant_member(tenant_id)`), então o primeiro `)` fecha o
 * argumento da função, não a cláusula. Com o regex ingênuo o predicado lido
 * seria `is_tenant_member(tenant_id`, e qualquer asserção sobre ele estaria
 * medindo um texto truncado — o mesmo erro de família que este arquivo já
 * cometeu cinco vezes.
 */
function predicado(corpo: string, clausula: 'using' | 'with check'): string | null {
  const re = clausula === 'using' ? /\busing\s*\(/i : /\bwith\s+check\s*\(/i
  const m = re.exec(corpo)
  if (!m) return null

  const inicio = m.index + m[0].length
  let nivel = 0
  for (let i = inicio - 1; i < corpo.length; i++) {
    if (corpo[i] === '(') nivel++
    else if (corpo[i] === ')') {
      nivel--
      if (nivel === 0) return corpo.slice(inicio, i)
    }
  }
  return null
}

const POLICIES_DAS_SEIS = policies(UNIDADE_SEM_COMENTARIOS)
  .filter(p => (TABELAS as readonly string[]).includes(p.alvo))

/**
 * A régua única de policy das seis tabelas: `is_tenant_member(tenant_id)` no
 * `using` E no `with check`.
 *
 * É a invariante nº 1 do repositório escrita como privilégio. Policy de
 * qualquer outra natureza — do portal, `true`, filtro escrito à mão — cai por
 * padrão, tenha o nome que tiver.
 */
function afirmaPolicyDeMembro(p: { nome: string, alvo: string, corpo: string }) {
  for (const clausula of ['using', 'with check'] as const) {
    const pred = predicado(p.corpo, clausula)
    expect(pred, `policy ${p.nome} (${p.alvo}) não declara ${clausula}`).not.toBeNull()
    // `using (true)` é o "conserto" mais comum desta classe: alguém destrava
    // uma consulta do painel que voltava vazia e, sem perceber, dá cobrança,
    // repasse e dado bancário das outras três imobiliárias a qualquer membro.
    expect(
      pred!.trim(),
      `policy ${p.nome} (${p.alvo}) tem ${clausula} (true)`,
    ).not.toBe('true')
    expect(
      pred!,
      `policy ${p.nome} (${p.alvo}): ${clausula} não invoca is_tenant_member(tenant_id)`,
    ).toMatch(/is_tenant_member\s*\(\s*tenant_id\s*\)/)
  }
}

describe('0041 — toda tabela nasce fechada', () => {
  for (const t of TABELAS) {
    test(`${t}: existe, tem tenant_id e RLS`, () => {
      expect(SQL_SEM_COMENTARIOS).toContain(`create table if not exists public.${t}`)
      expect(bloco(SQL_SEM_COMENTARIOS, t), `${t} precisa de tenant_id não nulo`).toMatch(/tenant_id uuid not null/)
      // `\s+` e não espaço único: o SQL alinha as colunas destes blocos para
      // ficarem legíveis, e um regex rígido falharia por formatação.
      expect(SQL_SEM_COMENTARIOS).toMatch(new RegExp(`alter table public\\.${t}\\s+enable row level security`))
    })

    test(`${t}: revoke do anon`, () => {
      // A policy sozinha não basta: o Supabase dá GRANT default ao `anon`, e as
      // migrations 0005, 0011 e 0015 existem porque isso falhou uma vez cada.
      expect(SQL_SEM_COMENTARIOS).toMatch(new RegExp(`revoke all on public\\.${t}\\s+from anon`))
    })

    test(`${t}: policy de membro`, () => {
      const daTabela = POLICIES_DAS_SEIS.filter(p => p.alvo === t)
      expect(daTabela.length, `${t} não tem nenhuma create policy`).toBeGreaterThan(0)

      for (const p of daTabela) {
        // `to authenticated` explícito, e não o default `to public`: é o
        // advisor 0003. Sem ele a policy é avaliada também para o `anon`.
        expect(p.corpo, `policy ${p.nome} (${t}) não é to authenticated`).toMatch(/\bto\s+authenticated\b/)
        afirmaPolicyDeMembro(p)
      }
    })

    test(`${t}: índice começando por tenant_id`, () => {
      // A RLS acrescenta o predicado de tenant a toda consulta; índice que não
      // começa por ele não é usado.
      expect(SQL_SEM_COMENTARIOS).toMatch(new RegExp(`create index if not exists[^;]*on public\\.${t} \\(tenant_id`))
    })
  }

  test('NENHUMA policy das seis abre para o portal', () => {
    // O cliente não lê estas tabelas na v1. Se um dia ler, a régua é
    // `portal_my_parties()` — e aí é outra migration, com sua própria revisão.
    //
    // Antes isto era uma denylist de dois nomes (`portal_my_parties` e
    // `is_portal_user`). Uma policy escrita à mão com
    // `exists (select 1 from public.portal_users pu where ...)` — que é
    // exatamente a forma que a 0028 usa em `contracts` — passava verde e abria
    // as seis para o cliente. Denylist de nome só pega quem usa o nome.
    //
    // Invertido: exige-se a régua de membro em TODA policy das seis. Policy de
    // outra natureza cai por padrão.
    expect(POLICIES_DAS_SEIS.length, 'nenhuma policy encontrada nas seis tabelas').toBeGreaterThan(0)
    for (const p of POLICIES_DAS_SEIS) afirmaPolicyDeMembro(p)
  })

  test('NENHUMA das seis aparece num grant para anon', () => {
    // A invariante nº 3 do repositório aplicada a tabelas que nascem inteiras
    // como coluna interna: `payout_destinations` guarda chave Pix, agência,
    // conta e o documento do titular de pessoa real, e a anon key vai no HTML
    // de toda página pública.
    //
    // O `revoke all ... from anon` da 0041 não protege sozinho: um
    // `grant select on public.payout_destinations to anon;` escrito DEPOIS dele
    // desfaz o revoke, e nenhuma asserção deste arquivo olhava para grant.
    // Varre a unidade de schema inteira (0041 + 0042) porque quem desfaz um
    // revoke costuma fazê-lo na migration seguinte.
    const grants = UNIDADE_SEM_COMENTARIOS.match(/\bgrant\b[^;]*;/gi) ?? []
    for (const g of grants) {
      if (!/\bto\b[^;]*\banon\b/i.test(g)) continue
      for (const t of TABELAS) {
        expect(g, `grant para anon toca ${t}: ${g.replace(/\s+/g, ' ').trim()}`)
          .not.toMatch(new RegExp(`\\b${t}\\b`))
      }
    }
  })
})

/**
 * Toda referência declarada dentro de um bloco de `create table`, nas duas
 * formas que o Postgres aceita, com a informação de se ela leva `tenant_id`.
 *
 * Comentário é removido antes: o modelo financeiro comenta muito, e um `--`
 * falando de outra tabela não pode virar FK aos olhos do teste.
 *
 * ⚠️ O prefixo `public.` é OPCIONAL nos dois regexes. `references
 * owner_payouts(id)` sem prefixo é SQL válido, resolve pelo `search_path` e
 * cria exatamente a FK de coluna única que o invariante abaixo existe para
 * proibir — mas era invisível para o regex que exigia o prefixo, e passava
 * verde.
 */
function referencias(corpo: string) {
  const sem = semComentarios(corpo)
  const achadas: { coluna: string, alvo: string, composta: boolean }[] = []

  // No nível da coluna (`conta_id uuid references public.contas(id)`). Esta
  // forma é single-column por definição: o Postgres não aceita par aqui.
  for (const m of sem.matchAll(/^\s*([a-z_]+)\s+uuid[^,\n]*?references\s+(?:public\.)?([a-z_]+)\s*\(\s*id\s*\)/gm)) {
    achadas.push({ coluna: m[1]!, alvo: m[2]!, composta: false })
  }

  // No nível da tabela (`foreign key (...) references public.contas (...)`).
  for (const m of sem.matchAll(/foreign key\s*\(([^)]*)\)\s*references\s+(?:public\.)?([a-z_]+)\s*\(([^)]*)\)/g)) {
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
      expect(bloco(SQL_SEM_COMENTARIOS, t)).toMatch(/foreign key \([a-z_]+_id, tenant_id\) references/)
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
      for (const { coluna, alvo, composta } of referencias(bloco(SQL_SEM_COMENTARIOS, t))) {
        if (alvo === 'tenants' || composta) continue

        expect(
          UNIDADE_SEM_COMENTARIOS,
          `${t}.${coluna} referencia ${alvo} sem tenant_id e nada promove a FK`,
        ).toMatch(
          new RegExp(
            `foreign key \\(${coluna}, tenant_id\\)\\s*references\\s+(?:public\\.)?${alvo}\\s*\\(\\s*id,\\s*tenant_id\\s*\\)`,
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
      for (const { alvo, composta } of referencias(bloco(SQL_SEM_COMENTARIOS, t))) {
        if (composta) alvos.add(alvo)
      }
    }
    expect(alvos.size).toBeGreaterThan(0)

    for (const alvo of alvos) {
      const inline = bloco(UNIDADE_SEM_COMENTARIOS, alvo).includes('unique (id, tenant_id)')
      const indice = new RegExp(
        `create unique index if not exists[^;]*on public\\.${alvo} \\(id, tenant_id\\)`,
      ).test(UNIDADE_SEM_COMENTARIOS)
      expect(inline || indice, `${alvo} é alvo de FK composta e não tem unique (id, tenant_id)`).toBe(true)
    }
  })
})

describe('0041 — o que a spec decidiu, travado', () => {
  test('listas fechadas são CHECK, não enum', () => {
    // A spec registra que as listas de `kind` podem estar erradas e precisam de
    // validação com quem opera. Corrigir CHECK é drop+create; valor de enum não
    // se remove.
    expect(SQL_SEM_COMENTARIOS).not.toMatch(/create type public\.(charge|payout|settlement)/)
    expect(SQL_SEM_COMENTARIOS).toMatch(/check \(kind in \(/)
  })

  test('dinheiro é numeric(12,2)', () => {
    const colunas = SQL_SEM_COMENTARIOS.match(/^\s+(amount|issued_amount) [a-z0-9(),]+/gm) ?? []
    expect(colunas.length).toBeGreaterThan(0)
    for (const c of colunas) expect(c).toContain('numeric(12,2)')
  })

  // Por tabela, e não no arquivo inteiro: as duas declaram `idempotency_key`, e
  // uma asserção global era satisfeita por qualquer uma das duas. Tirar o
  // `unique` só de `owner_payouts` — o caso "webhook de repasse reenviado paga
  // duas vezes numa conta bancária real" — passava no teste.
  for (const t of ['charge_settlements', 'owner_payouts']) {
    test(`${t}: a chave de idempotência é única`, () => {
      expect(bloco(SQL_SEM_COMENTARIOS, t)).toMatch(/idempotency_key text unique/)
    })
  }

  test('as linhas de valor não têm updated_at', () => {
    // Append-only: correção é linha nova apontando para a que estorna.
    for (const t of ['charge_items', 'charge_settlements', 'payout_items']) {
      const corpo = bloco(SQL_SEM_COMENTARIOS, t)
      expect(corpo, `${t} não pode ter updated_at`).not.toContain('updated_at')
      expect(corpo).toMatch(/reverses_[a-z]+_id uuid/)
    }
  })

  test('competence carrega o aviso de que é mês de ocupação', () => {
    // Quem confundir com o mês do vencimento não quebra a aplicação: quebra o
    // DIMOB e o informe de rendimentos, sem erro em tempo de execução.
    //
    // Única asserção que lê o SQL COM comentário, e de propósito: aqui o aviso
    // É o comentário.
    expect(SQL).toMatch(/competence[\s\S]{0,200}ocupa/i)
  })
})
