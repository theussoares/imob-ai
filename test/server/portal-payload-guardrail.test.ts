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

/**
 * O fonte sem comentários.
 *
 * Os guardrails deste arquivo procuram padrões proibidos no código — e vários
 * desses padrões aparecem legitimamente em comentários, justamente para
 * explicar por que NÃO usá-los. Sem esta limpeza, documentar a regra quebra o
 * teste da regra, o que ensina a não documentar.
 */
function semComentarios(fonte: string): string {
  return fonte
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

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

describe('o convite só gera token em dois casos', () => {
  /**
   * ⚠️ A versão anterior deste bloco exigia que `linkDeRedefinicao` morasse sob
   * um `else if (existente)` — e essa era exatamente a condição ERRADA. A linha
   * em `portal_users` é criada também no caso 3 (conta preexistente de
   * terceiro), então bastava convidar duas vezes para a segunda chamada se
   * julgar reenvio e emitir o `recovery` na caixa da vítima. O teste passava
   * verde protegendo o buraco, porque afirmava sobre a forma do código e não
   * sobre o que ele faz.
   *
   * Quem responde por essa regra agora é `test/server/portal-invite.test.ts`,
   * que chama a função de verdade e verifica o e-mail que sai. O que ficou aqui
   * é só o que teste de unidade não alcança: que a condição do ramo seja a
   * coluna de confirmação, e não a existência da linha.
   */
  test('o ramo do token olha a confirmação do vínculo, não a existência da linha', () => {
    const fonte = readFileSync(
      join(process.cwd(), 'server', 'repositories', 'portal-invite.repository.ts'),
      'utf8',
    )

    const iChamada = fonte.indexOf('await linkDeRedefinicao(')
    expect(iChamada, 'linkDeRedefinicao não é mais chamado').toBeGreaterThan(-1)

    const antes = fonte.slice(0, iChamada)
    const iRamo = antes.lastIndexOf('} else if (vinculoConfirmado) {')
    expect(
      iRamo,
      'linkDeRedefinicao saiu do ramo `else if (vinculoConfirmado)` — convidar duas vezes voltaria a emitir token para conta de terceiro',
    ).toBeGreaterThan(-1)

    // E nada entre o ramo e a chamada pode ter fechado o bloco.
    expect(antes.slice(iRamo).includes('\n  } else {')).toBe(false)

    // A confirmação vem da coluna, não de qualquer outro sinal do request.
    expect(semComentarios(fonte)).toContain(
      'const vinculoConfirmado = !!existente?.access_confirmed_at',
    )
  })

  test('quem confirma o vínculo é o login da própria pessoa', () => {
    // A outra metade da regra. Se a gravação sair de `requirePortalUser`, o
    // caso 3 nunca mais vira caso 2 — o reenvio legítimo para de funcionar sem
    // ninguém perceber, porque falhar fechado é silencioso.
    const fonte = semComentarios(
      readFileSync(join(process.cwd(), 'server', 'utils', 'portal-auth.ts'), 'utf8'),
    )
    expect(fonte).toContain('access_confirmed_at')
    // Por service role: a policy do cliente sobre a própria linha é de leitura.
    expect(fonte).toContain('serviceSupabase()')
  })

  test('o caso de conta preexistente manda o template sem token', () => {
    const fonte = readFileSync(
      join(process.cwd(), 'server', 'repositories', 'portal-invite.repository.ts'),
      'utf8',
    )
    expect(fonte).toContain('emailAcessoLiberado')
    // E o resultado diz à tela qual caso foi, para ela não prometer um link que
    // não existe.
    expect(fonte).toContain('contaPreexistente')
  })
})

describe('o destino do link nunca vem de header', () => {
  const ARQUIVOS = [
    join(process.cwd(), 'server', 'api', 'admin', 'portal-users.post.ts'),
    join(process.cwd(), 'server', 'api', 'portal', 'recuperar-senha.post.ts'),
  ]

  test('quem gera link de sessão usa portalOrigin, não a origem da requisição', () => {
    // `getRequestURL(event).origin` sai de Host/X-Forwarded-Host — dado do
    // cliente. Como o link carrega `?code=`, um header forjado faria o e-mail da
    // vítima apontar para o servidor de quem forjou, que receberia o token ao
    // primeiro clique. A origem tem que sair do banco.
    for (const caminho of ARQUIVOS) {
      const codigo = semComentarios(readFileSync(caminho, 'utf8'))
      expect(codigo, `${caminho} ainda deriva o destino da requisição`).not.toContain(
        'getRequestURL(event).origin',
      )
      expect(codigo, `${caminho} não usa portalOrigin`).toContain('portalOrigin')
    }
  })

  test('portalOrigin não aceita host da requisição como fonte', () => {
    const codigo = semComentarios(
      readFileSync(join(process.cwd(), 'server', 'utils', 'portal-origin.ts'), 'utf8'),
    )
    // Nem o evento entra aqui: a assinatura recebe client e tenant.
    expect(codigo).not.toContain('getRequestURL')
    expect(codigo).not.toContain('getHostname')
    expect(codigo).not.toContain('getRequestHost')
    expect(codigo).toContain('getPrimaryDomain')
  })
})

describe('conta de equipe não vira cadastro de cliente', () => {
  test('o convite recusa e-mail que é membro de painel', () => {
    // auth.users é compartilhado entre equipe e cliente. Sem esta recusa, uma
    // imobiliária cadastra o operador de outra como "cliente" — com nome, CPF e
    // telefone digitados por terceiro, sem ninguém perguntar a ele.
    const fonte = readFileSync(
      join(process.cwd(), 'server', 'repositories', 'portal-invite.repository.ts'),
      'utf8',
    )
    expect(fonte).toContain('ehMembroDePainel')
    expect(fonte).toContain("from('tenant_members')")

    // Só para cadastro novo: recusar no reenvio quebraria um vínculo que já
    // existe, sem proteger nada.
    expect(fonte).toContain('!existente && (await ehMembroDePainel(')
  })

  test('a recusa não revela que a conta é administrativa', () => {
    // Quem cadastra não precisa descobrir, pelo erro, que aquele endereço é de
    // equipe em alguma imobiliária da plataforma.
    const fonte = readFileSync(
      join(process.cwd(), 'server', 'repositories', 'portal-invite.repository.ts'),
      'utf8',
    )
    const casado = fonte.match(/statusMessage:\s*\n?\s*'([^']*endereço pessoal[^']*)'/)
    expect(casado, 'mensagem de recusa não encontrada').toBeTruthy()

    const mensagem = (casado?.[1] || '').toLowerCase()
    for (const vazamento of ['equipe', 'administrativ', 'painel', 'imobiliária']) {
      expect(mensagem, `a mensagem revela "${vazamento}"`).not.toContain(vazamento)
    }
  })
})

describe('o entitlement do portal', () => {
  test('a suspensão NÃO menciona pagamento', () => {
    // Decisão do plano: expor a inadimplência da imobiliária aos clientes DELA
    // é dano à imagem de terceiro. O cliente é mandado para quem tem a relação
    // com ele, sem saber por quê.
    const fonte = readFileSync(join(process.cwd(), 'server', 'utils', 'portal-auth.ts'), 'utf8')
    const casado = fonte.match(/statusMessage:\s*\n?\s*'([^']*temporariamente indisponível[^']*)'/)
    expect(casado, 'mensagem de suspensão não encontrada').toBeTruthy()

    const msg = (casado?.[1] || '').toLowerCase()
    for (const proibido of ['pagamento', 'pagar', 'fatura', 'inadimpl', 'assinatura', 'plano']) {
      expect(msg, `a mensagem menciona "${proibido}"`).not.toContain(proibido)
    }
  })

  test('requirePortalUser usa a mesma regra que o teste cobre', () => {
    // A regra da carência existe em dois lugares: aqui e em `is_portal_user()`
    // no banco. Duas implementações acabariam discordando, e a que discorda em
    // produção é a que ninguém testou — foi o que aconteceu com `> now()`
    // contra o `>= current_date` do banco.
    const fonte = readFileSync(join(process.cwd(), 'server', 'utils', 'portal-auth.ts'), 'utf8')
    expect(fonte).toContain('recursoAtivo(')
  })
})

describe('campos internos nunca saem numa resposta do portal', () => {
  /**
   * Os três que o card 3.2 nomeia, mais os que a 0028 pôs em
   * `contract_internal` justamente para não vazarem.
   *
   * `admin_fee_percent` é margem comercial: o proprietário tem direito ao
   * número, mas ele chega pelo extrato de repasse — documento endereçado —, não
   * por consulta à API.
   */
  const PROIBIDOS_SNAKE = ['notes', 'external_id', 'admin_fee_percent']
  const PROIBIDOS_CAMEL = ['notes', 'externalId', 'adminFeePercent']

  test('o tipo ContractForClient não declara nenhum deles', () => {
    // A fronteira é o TIPO: se ele não tem o campo, nenhuma tela pode devolvê-lo
    // sem o typecheck reclamar.
    const modelo = readFileSync(join(process.cwd(), 'shared', 'models', 'portal.ts'), 'utf8')
    const i = modelo.indexOf('export interface ContractForClient')
    expect(i).toBeGreaterThan(-1)
    const bloco = modelo.slice(i, modelo.indexOf('}', i))

    for (const campo of PROIBIDOS_CAMEL) {
      expect(bloco, `ContractForClient declara ${campo}`).not.toContain(`${campo}:`)
    }
  })

  test('nenhum endpoint do portal lê a tabela de campos internos', () => {
    // `contract_internal` existe para ser lida SÓ pelo painel. Um select dela
    // num endpoint do portal seria o vazamento inteiro numa linha.
    for (const caminho of arquivosPorExtensao(join(process.cwd(), 'server', 'api', 'portal'), ['.ts'])) {
      const fonte = readFileSync(caminho, 'utf8')
      expect(fonte, `${caminho} toca contract_internal`).not.toContain('contract_internal')
      expect(fonte, `${caminho} chama getContractInternal`).not.toContain('getContractInternal')
    }
  })

  test('o mapper do cliente monta do zero, sem espalhar a row', () => {
    // Copiar a row e apagar chaves é como uma coluna interna nova chega ao
    // portal sem ninguém decidir: o `delete` de hoje não sabe da coluna de
    // amanhã. O teste trava a forma, não o resultado.
    const mapper = readFileSync(join(process.cwd(), 'server', 'mappers', 'contract.mapper.ts'), 'utf8')
    const i = mapper.indexOf('export function toContractForClientModel')
    const bloco = mapper.slice(i, mapper.indexOf('\n}', i))

    expect(bloco, 'o mapper do cliente espalha a row').not.toContain('...row')
    expect(bloco, 'o mapper do cliente usa delete').not.toContain('delete ')
    for (const campo of PROIBIDOS_SNAKE) {
      expect(bloco, `o mapper do cliente lê ${campo}`).not.toContain(campo)
    }
  })

  test('a URL assinada tem vida curta', () => {
    // Card 3.2. URL longa vazada num print ou num encaminhamento de e-mail vira
    // acesso permanente ao documento.
    const fonte = readFileSync(
      join(process.cwd(), 'server', 'api', 'portal', 'documentos', '[id]', 'download.post.ts'),
      'utf8',
    )
    const casado = fonte.match(/URL_TTL_SEGUNDOS\s*=\s*(\d+)/)
    expect(casado, 'TTL da URL assinada não encontrado').toBeTruthy()

    const segundos = Number(casado?.[1])
    expect(segundos, 'TTL alto demais para uma URL que dá acesso a documento').toBeLessThanOrEqual(300)
    expect(segundos, 'TTL curto demais: o download nem começa').toBeGreaterThanOrEqual(30)
  })
})
