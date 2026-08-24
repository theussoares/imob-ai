import { beforeEach, describe, expect, test } from 'vitest'
import { clearInflight, dedupeInflight, stableKeyPart } from '~~/shared/utils/inflight'

describe('stableKeyPart', () => {
  test('a ordem das chaves não muda a saída', () => {
    expect(stableKeyPart({ a: 1, b: 2 })).toBe(stableKeyPart({ b: 2, a: 1 }))
  })

  // O erro clássico é usar `JSON.stringify(obj, chaves)`: o array vira REPLACER
  // e filtra as chaves recursivamente, então `{query:{page:2}}` sai como
  // `{"query":{}}` — e duas páginas diferentes colidem na mesma chave.
  test('valores aninhados distintos produzem chaves distintas', () => {
    expect(stableKeyPart({ query: { page: 2 } })).not.toBe(stableKeyPart({ query: { page: 3 } }))
    expect(stableKeyPart({ query: { a: 1, b: 2 } })).not.toBe(stableKeyPart({ query: { a: 1 } }))
  })

  test('arrays respeitam a ordem', () => {
    expect(stableKeyPart({ ids: [1, 2] })).not.toBe(stableKeyPart({ ids: [2, 1] }))
  })

  // Não dá para provar que dois FormData são iguais, então não se deduplica:
  // devolver a mesma chave colapsaria requisições diferentes.
  test('objeto não-simples nunca casa com outro', () => {
    const a = stableKeyPart({ body: new FormData() })
    const b = stableKeyPart({ body: new FormData() })

    expect(a).not.toBe(b)
  })
})

/** Promise que só resolve quando o teste mandar. */
function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('dedupeInflight', () => {
  beforeEach(() => clearInflight())

  test('chamadas concorrentes com a mesma chave executam uma vez só', async () => {
    const d = deferred<string>()
    let execucoes = 0
    const run = () => {
      execucoes++
      return d.promise
    }

    const a = dedupeInflight('k', run)
    const b = dedupeInflight('k', run)
    d.resolve('ok')

    expect(await a).toBe('ok')
    expect(await b).toBe('ok')
    expect(execucoes).toBe(1)
  })

  test('chaves diferentes não se misturam', async () => {
    const chamadas: string[] = []
    const run = (nome: string) => async () => {
      chamadas.push(nome)
      return nome
    }

    const [a, b] = await Promise.all([dedupeInflight('a', run('a')), dedupeInflight('b', run('b'))])

    expect(a).toBe('a')
    expect(b).toBe('b')
    expect(chamadas.sort()).toEqual(['a', 'b'])
  })

  // Dedupe é para chamadas SIMULTÂNEAS, não cache. Se a entrada sobrevivesse à
  // resolução, a tela passaria a mostrar dado velho sem pedir.
  test('depois de terminar, a próxima chamada executa de novo', async () => {
    let execucoes = 0
    const run = async () => {
      execucoes++
      return execucoes
    }

    expect(await dedupeInflight('k', run)).toBe(1)
    expect(await dedupeInflight('k', run)).toBe(2)
  })

  test('rejeição chega a todos os que esperavam e não prende a chave', async () => {
    const d = deferred<string>()
    let execucoes = 0
    const falha = () => {
      execucoes++
      return d.promise
    }

    const a = dedupeInflight('k', falha)
    const b = dedupeInflight('k', falha)
    d.reject(new Error('caiu'))

    await expect(a).rejects.toThrow('caiu')
    await expect(b).rejects.toThrow('caiu')
    expect(execucoes).toBe(1)

    // A chave tem que estar livre — senão um erro transitório congelaria a tela.
    expect(await dedupeInflight('k', async () => 'depois')).toBe('depois')
  })

  // O caso que motiva o clear: um GET em voo, uma mutação termina, a tela chama
  // refresh(). Sem limpar, o refresh receberia a resposta de ANTES da mutação.
  test('clearInflight faz a próxima chamada executar, mesmo com uma em voo', async () => {
    const antiga = deferred<string>()
    let execucoes = 0
    const run = () => {
      execucoes++
      return antiga.promise
    }

    const emVoo = dedupeInflight('k', run)
    clearInflight()
    const depois = dedupeInflight('k', async () => 'fresco')

    expect(await depois).toBe('fresco')
    expect(execucoes).toBe(1)

    antiga.resolve('velho')
    expect(await emVoo).toBe('velho')
  })
})
