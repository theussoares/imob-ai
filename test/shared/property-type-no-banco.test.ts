import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { PROPERTY_TYPES } from '~~/shared/models/property-type'
import { Constants } from '~~/shared/types/database.types'

/**
 * `properties.type` é um ENUM do Postgres, não texto com CHECK. O formulário do
 * painel deriva as opções do registro em shared/models/property-type.ts, então
 * acrescentar um tipo lá e esquecer a migration produz exatamente o pior tipo de
 * falha: a opção aparece na tela, a pessoa preenche o cadastro inteiro e o
 * salvar estoura com "invalid input value for enum property_type" — erro do
 * banco, no fim do caminho, sem nada no código sinalizando antes.
 *
 * O TypeScript não pega isso: o registro é a fonte do tipo `PropertyType`, e um
 * tipo novo é sempre válido para ele próprio. A 0027 existe porque essa lacuna
 * já foi descoberta em produção uma vez.
 *
 * Este teste lê o SQL das migrations de propósito, e não o banco: a suíte roda
 * em Node puro, sem credencial e sem rede (ver vitest.config.ts). O preço é
 * confiar que a pasta reflete o que foi aplicado — o que o README das migrations
 * alerta NÃO ser verdade para policies. Para valor de enum a aposta se sustenta:
 * `add value if not exists` é aditivo e idempotente, então aplicar de novo o que
 * já existe lá não custa nada.
 */
const DIR = join(process.cwd(), 'supabase/migrations')

/**
 * Valores de `property_type` declarados num texto SQL: o create da 0001 mais
 * cada alter.
 *
 * Comentário é removido ANTES de procurar, e essa linha é a que importa. Sem
 * ela, um ALTER comentado — que é como se adia um valor ("o cliente ainda vai
 * decidir se quer barracão") — contava como declarado, e o guarda ficava verde
 * exatamente no caso que ele existe para pegar. Conferido: a versão anterior
 * achava `barracao` num `-- alter type ... 'barracao';`.
 *
 * Extraída do acesso ao disco para ser testada por si só, como
 * `containsRawImovelPath` em test/server/property-url-callers.test.ts: uma
 * regra que só roda sobre arquivos reais não tem como provar que rejeita o que
 * deve rejeitar.
 *
 * A remoção é textual, então um `--` dentro de string literal levaria junto o
 * resto da linha. Nas migrations isso não acontece: os literais aqui são
 * valores de enum, `[a-z]+`.
 */
function valoresDeclaradosNoSql(sql: string): Set<string> {
  const semComentario = sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '')
  const encontrados = new Set<string>()

  for (const m of semComentario.matchAll(
    /alter\s+type\s+property_type\s+add\s+value\s+(?:if\s+not\s+exists\s+)?'([^']+)'/gi,
  )) {
    encontrados.add(m[1]!)
  }

  const criacao = semComentario.match(/create\s+type\s+property_type\s+as\s+enum\s*\(([^)]*)\)/i)
  if (criacao) {
    for (const m of criacao[1]!.matchAll(/'([^']+)'/g)) encontrados.add(m[1]!)
  }
  return encontrados
}

/** O mesmo, sobre a pasta inteira de migrations. */
function valoresNasMigrations(): Set<string> {
  const todos = new Set<string>()
  for (const arquivo of readdirSync(DIR).filter((f) => f.endsWith('.sql'))) {
    for (const v of valoresDeclaradosNoSql(readFileSync(join(DIR, arquivo), 'utf8'))) {
      todos.add(v)
    }
  }
  return todos
}

describe('leitura do SQL', () => {
  test('acha o valor de um alter', () => {
    expect(valoresDeclaradosNoSql("alter type property_type add value 'casa';")).toEqual(
      new Set(['casa']),
    )
  })

  test('acha os valores do create original', () => {
    expect(
      valoresDeclaradosNoSql("create type property_type as enum ('casa', 'apartamento');"),
    ).toEqual(new Set(['casa', 'apartamento']))
  })

  // O caso que motivou extrair esta função. Um ALTER comentado é uma declaração
  // que NÃO aconteceu no banco — contá-la é pior do que não olhar, porque dá a
  // garantia sem o fato.
  test('ignora alter comentado', () => {
    const sql = [
      '-- Adiar o barracão: o cliente ainda vai decidir.',
      "-- alter type property_type add value if not exists 'barracao';",
      "alter type property_type add value if not exists 'sala';",
    ].join('\n')
    expect(valoresDeclaradosNoSql(sql)).toEqual(new Set(['sala']))
  })

  test('ignora alter dentro de bloco /* */', () => {
    const sql = "/* alter type property_type add value 'barracao'; */"
    expect(valoresDeclaradosNoSql(sql)).toEqual(new Set())
  })
})

describe('todo tipo do registro existe no enum do banco', () => {
  /**
   * Se a regex algum dia parar de casar com o SQL real, este teste não fica
   * verde por vacuidade: `noSql` vem vazio e ele falha listando o registro
   * inteiro. É por isso que não existe aqui um teste separado de "a leitura não
   * voltou vazia" — ele seria implicado por este e nunca falharia sozinho.
   */
  test('cada chave tem migration que a declara', () => {
    const noSql = valoresNasMigrations()
    const faltando = PROPERTY_TYPES.filter((t) => !noSql.has(t))
    expect(
      faltando,
      `sem "alter type property_type add value" em supabase/migrations/: ${faltando.join(', ')}`,
    ).toEqual([])
  })

  /**
   * database.types.ts é gerado do banco. Ele divergir do registro significa que
   * um dos dois foi editado sozinho — e é ele que tipa o `Insert` dos
   * repositories, então a divergência vira erro em tempo de escrita, não de
   * compilação.
   */
  test('o enum gerado e o registro têm o mesmo conjunto', () => {
    const gerado = [...Constants.public.Enums.property_type].sort()
    expect(gerado).toEqual([...PROPERTY_TYPES].sort())
  })
})
