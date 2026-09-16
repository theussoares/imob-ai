import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

/**
 * Guardrail da Área do Cliente.
 *
 * Espelha `public-payload-guardrail.test.ts` e pelo mesmo motivo: a proteção
 * mais importante desta feature não é uma função, é uma DECISÃO — e decisão
 * some em refactor sem deixar erro.
 *
 * A decisão, tomada na migration 0028 e contrária ao que o card 2.3 dizia: o
 * download é assinado com o token DO CLIENTE, não com service role. A 0028
 * criou a policy `portal client reads own documents` no bucket justamente para
 * existir uma segunda barreira no banco; service role IGNORA RLS, então
 * assinar com ela transformaria a policy em código morto — e ninguém
 * perceberia, porque o download continuaria funcionando.
 *
 * Esse é o tipo de regressão que não tem sintoma. Por isso ela é testada no
 * FONTE, não no comportamento.
 */

const PORTAL_API = join(process.cwd(), 'server', 'api', 'portal')

function arquivosTs(dir: string): string[] {
  const saida: string[] = []
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) saida.push(...arquivosTs(caminho))
    else if (nome.endsWith('.ts')) saida.push(caminho)
  }
  return saida
}

/**
 * Únicos usos legítimos de service role num endpoint AUTENTICADO do portal:
 *   - gravar a trilha de acesso (o cliente não pode forjar as próprias linhas);
 *   - contar a trilha para o rate limit (o cliente não lê a tabela).
 *
 * Em todo o resto, o client do cliente é que deve ser usado — é o que mantém a
 * RLS e a policy do bucket valendo.
 */
const USOS_PERMITIDOS = ['recordDocumentAccess', 'assertSubmitRateLimit']

/**
 * Endpoints NÃO autenticados, onde não existe token de cliente para usar.
 *
 * Exceção nominal, e não um afrouxamento da regra: cada arquivo aqui precisa de
 * um motivo que sobreviva à pergunta "por que não dá para usar o client do
 * cliente?". Acrescentar um nome a esta lista é uma decisão, não um atalho.
 *
 *   - recuperar-senha: quem esqueceu a senha não está logado. Não há sessão,
 *     logo não há token. O endpoint compensa respondendo igual para todo mundo
 *     e com intervalo mínimo por conta (migration 0033).
 */
const SEM_SESSAO_POSSIVEL = ['recuperar-senha.post.ts']

describe('endpoints do portal', () => {
  const arquivos = arquivosTs(PORTAL_API)

  test('existem endpoints para conferir', () => {
    // Se a pasta sumir ou for renomeada, este arquivo passaria vazio e mudo.
    expect(arquivos.length).toBeGreaterThan(0)
  })

  test('service role só é usado para a trilha e para o rate limit', () => {
    for (const caminho of arquivos) {
      if (SEM_SESSAO_POSSIVEL.some((nome) => caminho.endsWith(nome))) continue
      const fonte = readFileSync(caminho, 'utf8')
      let i = fonte.indexOf('serviceSupabase()')
      while (i !== -1) {
        const janela = fonte.slice(Math.max(0, i - 200), i)
        const permitido = USOS_PERMITIDOS.some((u) => janela.includes(u))
        expect(
          permitido,
          `${caminho}: serviceSupabase() fora de ${USOS_PERMITIDOS.join('/')} — ` +
            'service role ignora RLS e desliga a policy do bucket criada na 0028',
        ).toBe(true)
        i = fonte.indexOf('serviceSupabase()', i + 1)
      }
    }
  })

  test('toda exceção da lista existe de fato', () => {
    // Nome que sobra na lista depois de o arquivo sumir vira permissão fantasma:
    // um arquivo novo com o mesmo nome herdaria a exceção sem ninguém decidir.
    for (const nome of SEM_SESSAO_POSSIVEL) {
      expect(
        arquivos.some((f) => f.endsWith(nome)),
        `${nome} está na lista de exceções mas não existe mais`,
      ).toBe(true)
    }
  })

  test('a URL assinada sai do client do cliente, nunca do service role', () => {
    const download = arquivos.find((f) => f.includes('download'))
    expect(download, 'endpoint de download não encontrado').toBeTruthy()
    const fonte = readFileSync(download!, 'utf8')

    expect(fonte).toContain('client.storage')
    expect(fonte).not.toContain('serviceSupabase().storage')
  })

  test('o download confere a permissão em código antes de assinar', () => {
    // A policy do bucket é a segunda barreira, não a única: se o nome da
    // operação do Storage mudar, ela pode parar de valer sem aviso.
    const download = arquivos.find((f) => f.includes('download'))!
    const fonte = readFileSync(download, 'utf8')

    const iCheck = fonte.indexOf('canClientSeeDocument')
    const iSign = fonte.indexOf('createSignedUrl')
    expect(iCheck).toBeGreaterThan(-1)
    expect(iSign).toBeGreaterThan(-1)
    // Ordem importa: conferir depois de assinar é não conferir.
    expect(iCheck).toBeLessThan(iSign)
  })

  test('os papéis vêm do contrato, não do request', () => {
    // Aceitar `roles` do corpo da requisição deixaria o inquilino pedir o
    // documento do proprietário dizendo-se proprietário.
    for (const caminho of arquivos) {
      const fonte = readFileSync(caminho, 'utf8')
      expect(fonte).not.toMatch(/readBody[^\n]*rol/i)
      expect(fonte).not.toMatch(/getQuery[^\n]*rol/i)
    }
  })
})

describe('o bucket portal-docs nunca vira URL pública', () => {
  test('nenhum código chama getPublicUrl no bucket dos documentos', () => {
    // O bucket nasce privado na 0028, e o download passa por URL assinada de
    // vida curta. `getPublicUrl` não falharia alto num bucket privado — ele
    // devolve uma URL que simplesmente não funciona, ou pior, funcionaria se
    // alguém marcasse o bucket como público um dia. Achar a chamada no fonte é
    // mais confiável que descobrir pelo comportamento.
    const raizes = [
      join(process.cwd(), 'server'),
      join(process.cwd(), 'app'),
      join(process.cwd(), 'shared'),
    ]
    for (const raiz of raizes) {
      for (const caminho of arquivosPorExtensao(raiz, ['.ts', '.vue'])) {
        const fonte = readFileSync(caminho, 'utf8')
        if (!fonte.includes('portal-docs')) continue
        expect(fonte, `${caminho} usa getPublicUrl no bucket privado`).not.toContain('getPublicUrl')
      }
    }
  })
})

describe('a área do cliente fica fora da indexação', () => {
  test('o sitemap não lista /area-cliente', () => {
    // O sitemap é montado a partir de uma lista explícita (home, quero-vender,
    // categorias, bairros, imóveis). Este teste trava a lista.
    const fonte = readFileSync(
      join(process.cwd(), 'server', 'routes', 'sitemap.xml.get.ts'),
      'utf8',
    )
    expect(fonte).not.toContain('area-cliente')
  })

  test('toda página do portal declara noindex', () => {
    const paginas = arquivosVue(join(process.cwd(), 'app', 'pages', 'area-cliente'))
    expect(paginas.length).toBeGreaterThan(0)
    for (const caminho of paginas) {
      const fonte = readFileSync(caminho, 'utf8')
      expect(fonte, `${caminho} sem noindex`).toContain('noindex')
    }
  })
})

function arquivosPorExtensao(dir: string, exts: string[]): string[] {
  const saida: string[] = []
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) saida.push(...arquivosPorExtensao(caminho, exts))
    else if (exts.some((e) => nome.endsWith(e))) saida.push(caminho)
  }
  return saida
}

function arquivosVue(dir: string): string[] {
  const saida: string[] = []
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) saida.push(...arquivosVue(caminho))
    else if (nome.endsWith('.vue')) saida.push(caminho)
  }
  return saida
}
