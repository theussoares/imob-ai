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
  test('linkDeRedefinicao é chamado apenas para quem já é cliente deste tenant', () => {
    // Regra de segurança do card 1.2, achada na revisão: gerar um link de
    // redefinição para um e-mail com conta preexistente que NÃO é cliente deste
    // tenant permitiria que qualquer membro de qualquer imobiliária forçasse a
    // troca de senha de uma conta alheia — inclusive a de um admin concorrente,
    // que usa o mesmo auth.users. E o e-mail sairia do domínio verificado da
    // plataforma, com nome e Reply-To que a imobiliária edita.
    //
    // A regra mora num `else if (existente)`, que é fácil de reescrever sem
    // perceber. Este teste olha o fonte porque o caminho depende do Supabase e
    // não é alcançável por teste de unidade.
    const fonte = readFileSync(
      join(process.cwd(), 'server', 'repositories', 'portal-invite.repository.ts'),
      'utf8',
    )

    const iChamada = fonte.indexOf('await linkDeRedefinicao(')
    expect(iChamada, 'linkDeRedefinicao não é mais chamado').toBeGreaterThan(-1)

    // A chamada tem que estar sob o ramo de cliente já existente.
    const antes = fonte.slice(0, iChamada)
    const iRamo = antes.lastIndexOf('} else if (existente) {')
    expect(
      iRamo,
      'linkDeRedefinicao saiu de dentro do ramo `else if (existente)` — conta preexistente de terceiro voltaria a receber token',
    ).toBeGreaterThan(-1)

    // E nada entre o ramo e a chamada pode ter fechado o bloco.
    expect(antes.slice(iRamo).includes('\n  } else {')).toBe(false)
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

  test('o painel nunca é cortado pelo entitlement', () => {
    // Regra 1 do plano, e a que tem precedente judicial: cortar o painel É
    // reter dado do cliente. O conjunto do recurso só pode aparecer no termo
    // do CLIENTE das policies, nunca colado no is_tenant_member.
    const sql = readFileSync(
      join(process.cwd(), 'supabase', 'migrations', '0036_tenant_features_portal.sql'),
      'utf8',
    )
    // Nenhuma linha pode ter os dois na mesma expressão de conjunção.
    for (const linha of sql.split('\n')) {
      if (linha.trimStart().startsWith('--')) continue
      const temMembro = linha.includes('is_tenant_member')
      const temRecurso = linha.includes('tenant_feature_ativa')
      expect(temMembro && temRecurso, `entitlement colado no painel: ${linha.trim()}`).toBe(false)
    }
  })

  test('requirePortalUser usa a mesma regra que o teste cobre', () => {
    // Duas implementações da carência acabariam discordando, e a que discorda
    // em produção é a que ninguém testou.
    const fonte = readFileSync(join(process.cwd(), 'server', 'utils', 'portal-auth.ts'), 'utf8')
    expect(fonte).toContain('recursoAtivo(')
  })
})
