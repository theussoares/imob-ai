import { afterEach, describe, expect, test } from 'vitest'
import { segredoDeRuntime, segredosAusentes } from '~~/server/utils/segredo'

/**
 * Segredo que a Vercel não entregava.
 *
 * ⚠️ O incidente de 17/09: a chave do provedor de e-mail estava configurada na
 * Vercel, o convite não saía e NÃO havia log nenhum. A causa é que
 * `nuxt.config.ts` roda no BUILD — `process.env.MAIL_API_KEY` ali vira um valor
 * assado no bundle (verifiquei: `mailApiKey: ""` está literalmente no arquivo
 * gerado em `.vercel/output`).
 *
 * O Nitro aplica variáveis de ambiente por REQUISIÇÃO, mas só as prefixadas com
 * `NUXT_` (`envPrefix: "NUXT_"`, também assado no bundle). O nome sem prefixo,
 * que é o que está configurado hoje, nunca é lido em execução.
 *
 * Este helper faz o nome sem prefixo voltar a valer em runtime, para que a
 * migração para `NUXT_`-prefixado seja opcional e não um degrau obrigatório.
 */

const ORIGINAL = { ...process.env }

afterEach(() => {
  process.env = { ...ORIGINAL }
})

describe('segredoDeRuntime', () => {
  test('o valor do runtimeConfig vence', () => {
    // É o caminho preferido: cobre o `.env` de desenvolvimento E a variável
    // `NUXT_`-prefixada, que o Nitro já aplica a cada requisição.
    process.env.TESTE_CHAVE = 'do-ambiente'
    expect(segredoDeRuntime('do-config', 'TESTE_CHAVE')).toBe('do-config')
  })

  test('sem config, lê o ambiente em execução', () => {
    // A rede que o incidente pediu: `MAIL_API_KEY` sem prefixo volta a valer.
    process.env.TESTE_CHAVE = 'do-ambiente'
    expect(segredoDeRuntime('', 'TESTE_CHAVE')).toBe('do-ambiente')
  })

  test('sem nenhum dos dois devolve vazio, não undefined', () => {
    // Quem chama testa por truthiness. `undefined` passaria igual, mas vazaria
    // para dentro de um cabeçalho HTTP se alguém interpolasse sem checar.
    delete process.env.TESTE_CHAVE
    expect(segredoDeRuntime('', 'TESTE_CHAVE')).toBe('')
    expect(segredoDeRuntime(undefined, 'TESTE_CHAVE')).toBe('')
  })

  test('espaço em volta é removido', () => {
    // Chave colada no painel da Vercel vem com quebra de linha no fim mais vezes
    // do que se imagina — e quebra de linha em valor de cabeçalho HTTP faz o
    // `fetch` lançar, com um erro que não menciona a chave em lugar nenhum.
    process.env.TESTE_CHAVE = '  re_abc123\n'
    expect(segredoDeRuntime('', 'TESTE_CHAVE')).toBe('re_abc123')
    expect(segredoDeRuntime(' do-config ', 'TESTE_CHAVE')).toBe('do-config')
  })

  test('config só com espaço cai para o ambiente', () => {
    // `' ' || x` devolveria o espaço, que é truthy. Sem isto, uma variável
    // definida como espaço no build esconderia a que está certa em runtime.
    process.env.TESTE_CHAVE = 'do-ambiente'
    expect(segredoDeRuntime('   ', 'TESTE_CHAVE')).toBe('do-ambiente')
  })
})

describe('segredosAusentes', () => {
  test('lista só o que falta, nunca o valor', () => {
    // ⚠️ O retorno vai para o log. Um segredo presente não pode aparecer nem
    // parcialmente: log é lido por mais gente que o painel da Vercel.
    const faltando = segredosAusentes({ mailApiKey: 'tem', mailFrom: '', supabaseUrl: '   ' })
    expect(faltando).toEqual(['mailFrom', 'supabaseUrl'])
  })

  test('nada faltando devolve lista vazia', () => {
    expect(segredosAusentes({ a: 'x', b: 'y' })).toEqual([])
  })

  test('a ordem é a do objeto, para a linha de log ser estável', () => {
    // Log que muda de ordem entre execuções não dá para comparar entre dois
    // deploys, que é exatamente o uso desta linha.
    expect(segredosAusentes({ z: '', a: '', m: '' })).toEqual(['z', 'a', 'm'])
  })
})
