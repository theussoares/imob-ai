import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

/**
 * Nenhum segredo é lido direto do `runtimeConfig`.
 *
 * ⚠️ A armadilha, medida e não suposta: `nuxt.config.ts` roda no BUILD. Um
 * `process.env.MAIL_API_KEY || ''` ali vira valor congelado no bundle — está
 * literalmente no arquivo gerado, como `mailApiKey: ""`. Em execução, o Nitro
 * aplica variáveis por requisição, mas só as prefixadas com `NUXT_`.
 *
 * Então `config.mailApiKey` sozinho é `''` em produção sempre que a variável foi
 * configurada com o nome sem prefixo — que é o caso desta implantação. O
 * sintoma: convite não sai, variável aparece configurada no painel, nenhum log.
 * Custou horas em 17/09/2026.
 *
 * `segredoDeRuntime` fecha isso. Este teste existe porque a leitura direta
 * CONTINUA COMPILANDO e continua funcionando em desenvolvimento, onde build e
 * execução são o mesmo momento — o defeito só aparece em produção.
 */

/** Chaves de `runtimeConfig` que carregam segredo ou endereço de serviço. */
const SEGREDOS = [
  'config.mailApiKey',
  'config.mailFrom',
  'config.supabaseServiceKey',
  'config.rateLimitIpSalt',
  'config.public.supabaseUrl',
  'config.public.supabaseKey',
  'useRuntimeConfig().mailFrom',
  'useRuntimeConfig().mailApiKey',
  'useRuntimeConfig().rateLimitIpSalt',
  'useRuntimeConfig().supabaseServiceKey',
]

/**
 * O próprio helper e o plugin de arranque leem as chaves — é o trabalho deles.
 * O plugin passa cada uma por `segredoDeRuntime`, então na prática só o helper
 * precisaria da isenção; ele fica listado para a exceção ser explícita.
 */
const ISENTOS = ['segredo.ts']

function arquivosTs(dir: string, acc: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) arquivosTs(caminho, acc)
    else if (nome.endsWith('.ts') && !ISENTOS.includes(nome)) acc.push(caminho)
  }
  return acc
}

describe('todo segredo passa por segredoDeRuntime', () => {
  const arquivos = arquivosTs(join(process.cwd(), 'server'))

  test('o varredor encontrou o código do servidor', () => {
    // Sem isto, um erro de caminho faria a suíte inteira passar sem checar nada
    // — o pior resultado possível para um teste de guardrail.
    expect(arquivos.length).toBeGreaterThan(20)
  })

  test('nenhuma leitura direta sobrou', () => {
    const infratores: string[] = []

    for (const caminho of arquivos) {
      const f = readFileSync(caminho, 'utf8')
      for (const chave of SEGREDOS) {
        let i = f.indexOf(chave)
        while (i !== -1) {
          // A leitura só vale se estiver DENTRO da chamada do helper. Olhar as
          // duas dezenas de caracteres anteriores basta: o helper recebe a
          // chave como primeiro argumento, sempre colado.
          const antes = f.slice(Math.max(0, i - 30), i)
          if (!antes.includes('segredoDeRuntime(')) {
            const linha = f.slice(0, i).split('\n').length
            infratores.push(`${caminho.split('server')[1]}:${linha} → ${chave}`)
          }
          i = f.indexOf(chave, i + 1)
        }
      }
    }

    expect(
      infratores,
      'leitura direta de segredo: vale no build e some em produção',
    ).toEqual([])
  })
})

describe('o arranque avisa o que falta', () => {
  const plugin = readFileSync(
    join(process.cwd(), 'server', 'plugins', 'segredos-no-arranque.ts'),
    'utf8',
  )

  test('o aviso é de erro, não de warn', () => {
    // Nenhum destes é opcional em produção: sem a service key toda escrita
    // pública cai, sem a chave de e-mail nenhum convite sai.
    expect(plugin).toContain('logError(')
  })

  test('só em produção', () => {
    // Em desenvolvimento a ausência é normal — dá para rodar o fluxo inteiro
    // sem conta em provedor. Gritar sempre treina todo mundo a ignorar a linha.
    expect(plugin).toContain("process.env.NODE_ENV !== 'production'")
  })

  test('o valor do segredo NUNCA vai para o log', () => {
    // Só os nomes do que falta. O log da Vercel é lido por mais gente que o
    // painel de variáveis, e um prefixo de chave já é material de ataque.
    //
    // A checagem olha o CÓDIGO, sem os comentários: a primeira versão deste
    // teste procurava a palavra "valor" no arquivo inteiro e falhou contra o
    // comentário que explica justamente esta regra.
    const codigo = plugin.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(codigo).toContain('segredosAusentes(')
    // O que sai no log é `faltando` (nomes) e `dica` (texto fixo). Truncar um
    // segredo para "conferir se é o certo" é a tentação óbvia aqui, e um
    // prefixo de chave já basta para restringir um ataque de força bruta.
    const payloadDoLog = codigo.slice(codigo.indexOf('logError('))
    expect(payloadDoLog).not.toMatch(/slice\(|substring\(|\.\.\.config/)
  })
})
