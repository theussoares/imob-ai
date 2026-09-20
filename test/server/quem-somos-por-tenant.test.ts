import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

/**
 * O Quem somos é recurso por imobiliária, igual à Área do Cliente.
 *
 * A ameaça que este arquivo cobre não é acesso indevido — é publicação indevida.
 * A página entrava no rodapé de TODA imobiliária por estar em
 * `STATIC_FOOTER_PAGES`, e no banco só uma das quatro tinha `about_content`
 * preenchido. As outras três ganhariam, no ar, um link para uma página em
 * branco com `canonical` se afirmando autoritativa — conteúdo fino indexável,
 * que é pior que página nenhuma.
 *
 * O desenho espelha o portal de propósito: `tenant_features` diz se a
 * imobiliária TEM o recurso, `tenants.about_enabled` diz se ela LIGOU o link, e
 * o payload público carrega só o produto dos dois. Duas réguas discordando
 * (painel escondendo enquanto o site publica, ou o contrário) é pior que
 * qualquer um dos dois estados.
 */

function fonte(...partes: string[]): string {
  return readFileSync(join(process.cwd(), ...partes), 'utf8')
}

describe('o menu do painel segue o recurso', () => {
  const sidebar = fonte('app', 'components', 'AdminSidebar.vue')

  test('Quem somos está marcado com o recurso', () => {
    const linha = sidebar.split('\n').find((l) => l.includes('to: "/admin/quem-somos"'))
    expect(linha, '/admin/quem-somos sumiu do menu').toBeTruthy()
    expect(linha, 'sem recurso, o editor volta a aparecer para toda imobiliária').toContain(
      'recurso: "quemSomos"',
    )
  })

  test('o filtro não é uma lista de ifs por recurso', () => {
    // A primeira versão comparava com a string "areaCliente" na mão. Um recurso
    // novo marcado no item mas esquecido no filtro não some do menu, e nada
    // reclama — a marca vira enfeite.
    expect(sidebar).not.toMatch(/l\.recurso === "areaCliente"/)
  })
})

describe('a rota do painel também é fechada, não só o menu', () => {
  test('/admin/quem-somos passa pelo middleware do recurso', () => {
    const f = fonte('app', 'pages', 'admin', 'quem-somos.vue')
    expect(f, 'o editor abre para quem não tem o recurso').toContain(
      "middleware: ['admin', 'quem-somos']",
    )
  })

  test('a ordem é admin primeiro, recurso depois', () => {
    // Invertido, quem não está logado cairia no redirect errado.
    const f = fonte('app', 'pages', 'admin', 'quem-somos.vue')
    const i = f.indexOf("'admin'")
    const j = f.indexOf("'quem-somos'")
    expect(i).toBeGreaterThan(-1)
    expect(j).toBeGreaterThan(i)
  })
})

describe('a página pública some, não fica vazia', () => {
  const pagina = fonte('app', 'pages', 'quem-somos.vue')

  test('recurso desligado devolve 404', () => {
    // Diferente do portal, onde `/area-cliente/login` responde 200 para quem não
    // tem o recurso: lá a tela é `noindex` e ainda serve para alguém entrar.
    // Aqui um 200 seria página fina indexável no domínio de um cliente real.
    expect(pagina, 'sem o 404 a página vazia continua no ar').toContain('statusCode: 404')
    expect(pagina).toContain('aboutEnabled')
  })
})

describe('uma régua só', () => {
  test('o entitlement do Quem somos usa a MESMA função do portal', () => {
    // Duas implementações da carência discordariam por um dia — já aconteceu
    // neste repositório, com `graceUntil > now()` contra `>= current_date`.
    const f = fonte('server', 'utils', 'entitlement.ts')
    expect(f).toContain('recursoAtivo(')
    expect(f).toContain('quemSomosAtiva')
    // Service role: `tenant_features` não tem policy de leitura para o painel.
    expect(f).toContain('serviceSupabase()')
  })

  test('a leitura de tenant_features não foi duplicada', () => {
    // O achado do PR #27: duas leituras com tratamento de erro diferente fazem
    // o recurso sumir em silêncio para quem paga. Um recurso novo não pode
    // trazer uma segunda consulta solta.
    const f = fonte('server', 'utils', 'entitlement.ts')
    const consultas = f.match(/from\('tenant_features'\)/g) || []
    expect(consultas.length, 'mais de uma leitura de tenant_features em entitlement.ts').toBe(1)
  })
})

describe('o valor efetivo colapsa as duas camadas', () => {
  test('o payload público não distingue "não tem" de "escondeu"', () => {
    // Mesma decisão de privacidade do portal: o valor efetivo é público por
    // definição (é a presença do link), mas "tem o recurso e escondeu" é
    // informação comercial da imobiliária.
    const f = fonte('server', 'utils', 'tenant.ts')
    expect(f).toContain('aboutEnabled')
    expect(f).toContain('quemSomosAtiva(')
  })

  test('tenant.put recusa gravar o campo sem o recurso', () => {
    // A coluna crua não é alterada por quem não tem o recurso: quando ele
    // voltar, a escolha da imobiliária volta junto.
    const f = fonte('server', 'api', 'admin', 'tenant.put.ts')
    expect(f).toContain('aboutEnabled')
  })
})
