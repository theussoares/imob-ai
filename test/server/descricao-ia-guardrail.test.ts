import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { AI_TONES } from '../../shared/models/ai-tone'
import { AI_GENERATION_KINDS, AI_GENERATION_STATUSES } from '../../shared/models/ai-generation'

/**
 * As invariantes de segurança da 0045, travadas por leitura do SQL.
 *
 * Mesmo padrão de `financeiro-guardrail.test.ts` e `public-payload-guardrail.test.ts`:
 * roda em `pnpm test`, sem banco, em segundos — e é o que fez este arquivo
 * existir. A rodada de revisão 1/5 da Task 2 encontrou um `revoke execute`
 * que não fechava nada (PUBLIC não revogado), um freio por minuto que
 * desligava em silêncio com `created_by` nulo e uma cota que ignorava `kind`.
 * Os três eram inspecionáveis no TEXTO do SQL sem tocar banco — só não havia
 * teste olhando para eles. `pnpm test` roda sempre; a checagem manual no SQL
 * Editor só roda quando alguém lembra.
 *
 * ⚠️ Guardrail que lê texto tem o modo de falha que `financeiro-guardrail.test.ts`
 * documenta: âncora frouxa casando o trecho errado, ou comentário sendo lido
 * como código. As mesmas duas defesas valem aqui — recorte por trecho NOMEADO
 * em vez de varredura do arquivo inteiro, e toda asserção estrutural lê o SQL
 * sem comentário.
 */

const SQL = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '0045_descricao_ia.sql'),
  'utf8',
)

/**
 * O SQL sem comentário — é dele que toda asserção estrutural lê.
 *
 * Comentar uma linha com `--` é a mutação mais barata que existe: sem isto,
 * `revoke all ... from anon` ou `enable row level security` comentados
 * continuariam casando DENTRO do comentário e o teste passaria verde medindo
 * proteção que não existe mais no banco.
 */
function semComentarios(sql: string): string {
  return sql.replace(/--[^\n]*/g, '')
}

const SQL_SEM_COMENTARIOS = semComentarios(SQL)

/**
 * O corpo de uma cláusula `check (...)` que começa logo após `marcador`, com
 * os parênteses balanceados.
 *
 * Não usa `[^)]*` ingênuo: `check (feature in ('portal', 'about', 'ai'))` tem
 * parênteses aninhados (`in (...)` dentro de `check (...)`), e um regex sem
 * balanceamento devolveria só até o primeiro `)`, que fecha o `in`, não o
 * `check` — cortando o texto antes do fim real da lista.
 *
 * `marcador` é o texto único que precede a cláusula — o nome da constraint
 * para as duas `add constraint`, ou a declaração de coluna para as duas
 * `check` inline de `ai_generations` (`kind`/`status` não têm nome de
 * constraint no texto da migration, o Postgres é quem nomeia). O marcador é o
 * que evita casar o `check (...)` errado quando há mais de um no arquivo.
 */
function checkClause(sql: string, marcador: string): string {
  const inicioMarcador = sql.indexOf(marcador)
  expect(inicioMarcador, `"${marcador}" não encontrado`).toBeGreaterThanOrEqual(0)

  const aberturaParen = sql.indexOf('(', inicioMarcador + marcador.length)
  let nivel = 0
  for (let i = aberturaParen; i < sql.length; i++) {
    if (sql[i] === '(') nivel++
    else if (sql[i] === ')') {
      nivel--
      if (nivel === 0) return sql.slice(aberturaParen, i + 1)
    }
  }
  throw new Error(`parênteses de "${marcador}" não fecham`)
}

/** Os valores citados dentro de um `in (...)`, sem aspas. */
function valoresDoIn(checkTexto: string): string[] {
  return [...checkTexto.matchAll(/'([^']*)'/g)].map(m => m[1]!)
}

/**
 * O corpo da função `reservar_geracao_ia`, do `create or replace function`
 * até o `end $$;` que a fecha — para asserções de ORDEM dentro dela (o lock
 * antes da contagem, a guarda antes do uso de `p_created_by`).
 */
function corpoDaFuncao(sql: string): string {
  const inicio = sql.indexOf('create or replace function public.reservar_geracao_ia')
  expect(inicio, 'função reservar_geracao_ia não encontrada').toBeGreaterThanOrEqual(0)
  const fim = sql.indexOf('end $$;', inicio)
  expect(fim, 'end $$; da função não encontrado').toBeGreaterThanOrEqual(0)
  return sql.slice(inicio, fim)
}

describe('0045 — entitlement não desliga recurso pago em silêncio', () => {
  test('tenant_features_feature_check lista os três valores, não só "ai"', () => {
    // A ameaça: recriar a constraint só com o valor novo (`in ('ai')`) desliga
    // Área do Cliente e Quem Somos de toda imobiliária que paga, sem erro em
    // lugar nenhum — o primeiro sinal seria uma ligação do cliente.
    const check = checkClause(SQL_SEM_COMENTARIOS, 'add constraint tenant_features_feature_check')
    expect(valoresDoIn(check).sort()).toEqual(['about', 'ai', 'portal'].sort())
  })
})

describe('0045 — ai_generations nasce fechada', () => {
  test('RLS ligada e revoke all para anon e authenticated', () => {
    // RLS com zero policies já fecha para `authenticated`; o revoke fecha
    // para `anon`, porque o Supabase dá GRANT default e policy sozinha não
    // basta (0011, 0028 e agora 0045 no mesmo padrão).
    expect(SQL_SEM_COMENTARIOS).toMatch(
      /alter table public\.ai_generations\s+enable row level security/,
    )
    expect(SQL_SEM_COMENTARIOS).toMatch(
      /revoke all on public\.ai_generations\s+from anon, authenticated/,
    )
  })

  test('status é CHECK fechado, batendo com AI_GENERATION_STATUSES', () => {
    // A lista e o banco não podem divergir em silêncio: se alguém adicionar
    // um status em shared/models/ai-generation.ts sem tocar a migration (ou
    // vice-versa), este teste reprova em vez de deixar o código aceitar um
    // valor que o banco rejeita — ou o banco aceitar um valor que o código
    // não reconhece. `status` não tem nome de constraint no texto (check
    // inline na coluna), por isso o marcador é a declaração da coluna.
    const check = checkClause(SQL_SEM_COMENTARIOS, "status text not null default 'reservada'")
    expect(valoresDoIn(check).sort()).toEqual([...AI_GENERATION_STATUSES].sort())
  })

  test('kind é CHECK fechado, batendo com AI_GENERATION_KINDS', () => {
    // Mesma ameaça do status: `kind` existe para o segundo uso de IA não
    // pedir tabela nova (ver shared/models/ai-generation.ts), e a lista
    // fechada no banco precisa reconhecer exatamente os mesmos valores que o
    // código emite — nem mais (valor morto no CHECK), nem menos (insert que
    // o código faz e o banco rejeita).
    const check = checkClause(SQL_SEM_COMENTARIOS, 'kind text not null')
    expect(valoresDoIn(check).sort()).toEqual([...AI_GENERATION_KINDS].sort())
  })
})

describe('0045 — tenants.ai_tone é lista fechada', () => {
  test('tenants_ai_tone_check bate com AI_TONES', () => {
    // Campo aberto aqui é instrução do cliente indo direto ao prompt de IA —
    // é a mesma classe de risco que motivou o CHECK, e o teste garante que a
    // lista fechada em código e a lista fechada no banco não se afastem.
    const check = checkClause(SQL_SEM_COMENTARIOS, 'add constraint tenants_ai_tone_check')
    expect(valoresDoIn(check).sort()).toEqual([...AI_TONES].sort())
  })
})

describe('0045 — reservar_geracao_ia', () => {
  const corpo = corpoDaFuncao(SQL_SEM_COMENTARIOS)

  test('o advisory lock é tomado ANTES da primeira contagem', () => {
    // Tomar o lock depois do `count(*)` não serializa nada: duas transações
    // concorrentes já teriam lido o contador antes de qualquer uma travar, e
    // as 300 chamadas pagas contra uma cota de 100 que o comentário da
    // migration descreve voltam a ser possíveis.
    const idxLock = corpo.indexOf('pg_advisory_xact_lock')
    const idxCount = corpo.indexOf('count(*)')
    expect(idxLock, 'pg_advisory_xact_lock não encontrado no corpo da função').toBeGreaterThanOrEqual(0)
    expect(idxCount, 'count(*) não encontrado no corpo da função').toBeGreaterThanOrEqual(0)
    expect(idxLock, 'o lock é tomado DEPOIS da primeira contagem — não serializa nada').toBeLessThan(idxCount)
  })

  test('a guarda de p_created_by nulo vem antes de qualquer count(*)', () => {
    // `created_by = p_created_by` com `p_created_by` nulo nunca é verdadeiro:
    // o count do freio por minuto dá 0 para qualquer volume de chamadas, e o
    // teto desliga sem erro em lugar nenhum. A guarda precisa vir antes das
    // contagens para que a função nunca chegue lá com o parâmetro nulo.
    const idxGuarda = corpo.indexOf('p_created_by is null')
    const idxCount = corpo.indexOf('count(*)')
    expect(idxGuarda, 'guarda de p_created_by nulo não encontrada').toBeGreaterThanOrEqual(0)
    expect(idxGuarda).toBeLessThan(idxCount)
  })

  test('as duas contagens de cota filtram por kind', () => {
    // Sem o filtro, o dia em que um segundo `kind` (ex.: 'titulo') nascer,
    // gerar título consome a MESMA cota de descrição — o cliente liga
    // dizendo que não consegue gerar descrição, e nada no banco explica.
    const contagens = [...corpo.matchAll(/select count\(\*\) from public\.ai_generations[\s\S]*?(?=>=)/g)]
    expect(contagens.length, 'as duas contagens de cota não foram encontradas').toBe(2)
    for (const c of contagens) {
      expect(c[0], 'contagem de cota sem "kind = p_kind"').toMatch(/kind = p_kind/)
    }
  })

  test('o recorte do mês usa America/Sao_Paulo, não UTC', () => {
    // Em UTC a cota vira às 21h do último dia do mês no horário de Campo
    // Grande — sintoma que ninguém liga à coluna certa.
    expect(corpo).toMatch(/at time zone 'America\/Sao_Paulo'/)
    expect(corpo).not.toMatch(/at time zone 'UTC'/)
  })

  test('EXECUTE é revogado de public, não só de anon e authenticated', () => {
    // O achado da revisão: toda função nasce com EXECUTE para PUBLIC
    // (`=X/postgres` no `proacl`, confirmado em produção), e anon/authenticated
    // herdam esse grant como qualquer role. `revoke ... from anon,
    // authenticated` sem `public` na lista deixa o grant de PUBLIC de pé — a
    // função continua chamável via `POST /rest/v1/rpc/reservar_geracao_ia`
    // com a anon key, com `p_cota_mes` controlado pelo chamador. Sem esta
    // asserção, o `public` na lista de revoke volta a desaparecer em silêncio
    // numa próxima edição.
    expect(SQL_SEM_COMENTARIOS).toMatch(
      /revoke execute on function public\.reservar_geracao_ia\([^)]*\)\s+from public, anon, authenticated/,
    )
  })

  test('EXECUTE é devolvido para service_role', () => {
    // Sem o grant explícito, revogar de `public` levaria junto o único
    // caminho que o `serviceSupabase()` do servidor usa para chamar a função.
    expect(SQL_SEM_COMENTARIOS).toMatch(
      /grant execute on function public\.reservar_geracao_ia\([^)]*\)\s+to service_role/,
    )
  })
})
