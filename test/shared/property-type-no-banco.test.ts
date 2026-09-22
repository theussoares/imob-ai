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

/** Valores de `property_type` declarados no SQL: o create da 0001 + cada alter. */
function valoresDeclaradosNoSql(): Set<string> {
  const encontrados = new Set<string>()
  for (const arquivo of readdirSync(DIR).filter((f) => f.endsWith('.sql'))) {
    const sql = readFileSync(join(DIR, arquivo), 'utf8')

    for (const m of sql.matchAll(
      /alter\s+type\s+property_type\s+add\s+value\s+(?:if\s+not\s+exists\s+)?'([^']+)'/gi,
    )) {
      encontrados.add(m[1]!)
    }

    const criacao = sql.match(/create\s+type\s+property_type\s+as\s+enum\s*\(([^)]*)\)/i)
    if (criacao) {
      for (const m of criacao[1]!.matchAll(/'([^']+)'/g)) encontrados.add(m[1]!)
    }
  }
  return encontrados
}

describe('todo tipo do registro existe no enum do banco', () => {
  test('cada chave tem migration que a declara', () => {
    const noSql = valoresDeclaradosNoSql()
    const faltando = PROPERTY_TYPES.filter((t) => !noSql.has(t))
    expect(
      faltando,
      `sem "alter type property_type add value" em supabase/migrations/: ${faltando.join(', ')}`,
    ).toEqual([])
  })

  // A regex acima só vale enquanto casa com o SQL real. Se alguém mudar o
  // formato dos ALTERs e ela passar a não achar nada, o teste acima ficaria
  // verde por vacuidade — verde justamente porque parou de olhar.
  test('a leitura do SQL não está devolvendo vazio', () => {
    expect(valoresDeclaradosNoSql().size).toBeGreaterThanOrEqual(PROPERTY_TYPES.length)
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
