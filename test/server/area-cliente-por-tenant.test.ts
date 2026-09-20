import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { recursoAtivo } from '~~/shared/utils/portal-access'

/**
 * A Área do Cliente é recurso por imobiliária — no painel também.
 *
 * O bug que originou este arquivo: `AdminSidebar.vue` listava "Contratos" e
 * "Clientes" num array fixo, sem condição nenhuma. Em produção isso apareceu
 * para TODA imobiliária, inclusive as que nunca viram a feature. Quem clicasse
 * chegava numa tela vazia — que parece sistema quebrado, não recurso ausente.
 *
 * A fonte da verdade é `tenant_features`, a mesma que a RLS lê dentro de
 * `portal_my_parties()` e que `requirePortalUser` consulta. Não pode haver uma
 * segunda régua: painel escondendo a tela enquanto o cliente ainda entra (ou o
 * contrário) é pior que qualquer um dos dois estados.
 */

function fonte(...partes: string[]): string {
  return readFileSync(join(process.cwd(), ...partes), 'utf8')
}

describe('o menu do painel segue o recurso', () => {
  const sidebar = fonte('app', 'components', 'AdminSidebar.vue')

  test('Contratos e Clientes estão marcados com o recurso', () => {
    // A marca é o que o filtro usa. Um item novo da Área do Cliente sem ela
    // voltaria a aparecer para todo mundo.
    for (const rota of ['/admin/contratos', '/admin/clientes']) {
      const linha = sidebar.split('\n').find((l) => l.includes(`to: "${rota}"`))
      expect(linha, `${rota} sumiu do menu`).toBeTruthy()
      expect(linha, `${rota} sem recurso: volta a aparecer para toda imobiliária`).toContain(
        'recurso: "areaCliente"',
      )
    }
  })

  test('o que não é da Área do Cliente continua sem marca', () => {
    // A trava não pode virar hábito de marcar tudo: Imóveis e Contatos são de
    // todas as imobiliárias.
    for (const rota of ['/admin/imoveis', '/admin/leads', '/admin/corretores']) {
      const linha = sidebar.split('\n').find((l) => l.includes(`to: "${rota}"`))
      expect(linha, `${rota} não deveria depender de recurso`).not.toContain('recurso:')
    }
  })

  test('a lista renderizada é a filtrada, não a completa', () => {
    // Filtrar e continuar renderizando o array cru é o jeito mais fácil de esta
    // correção virar código morto.
    expect(sidebar).toContain('const links = computed(')
    expect(sidebar).toContain('v-for="l in links"')
  })
})

describe('as rotas também são fechadas, não só o menu', () => {
  test('as três telas passam pelo middleware do recurso', () => {
    // Esconder só o item do menu deixaria o endereço digitável — "o link sumiu
    // mas a página abre" é inconsistência que vira pergunta ao suporte.
    for (const pagina of [
      ['app', 'pages', 'admin', 'contratos', 'index.vue'],
      ['app', 'pages', 'admin', 'contratos', '[id].vue'],
      ['app', 'pages', 'admin', 'clientes', 'index.vue'],
    ]) {
      const f = fonte(...pagina)
      expect(f, `${pagina.join('/')} sem a trava de recurso`).toContain(
        "middleware: ['admin', 'area-cliente']",
      )
    }
  })

  test('a ordem é admin primeiro, recurso depois', () => {
    // Invertido, quem não está logado cairia no redirect errado.
    const f = fonte('app', 'pages', 'admin', 'contratos', 'index.vue')
    const i = f.indexOf("'admin'")
    const j = f.indexOf("'area-cliente'")
    expect(i).toBeGreaterThan(-1)
    expect(j).toBeGreaterThan(i)
  })
})

describe('uma régua só', () => {
  test('o entitlement usa a MESMA função do portal', () => {
    // Duas implementações da carência discordariam por um dia — já aconteceu
    // neste repositório, com `graceUntil > now()` contra `>= current_date`.
    const f = fonte('server', 'utils', 'entitlement.ts')
    expect(f).toContain('recursoAtivo(')
    expect(f).toContain("from('tenant_features')")
    // Service role: `tenant_features` não tem policy de leitura para o painel.
    expect(f).toContain('serviceSupabase()')
  })

  test('quem precisa do entitlement passa pela fonte única', () => {
    // Três leituras soltas de `tenant_features` seriam três tratamentos de erro
    // — e foi um deles, descartando o erro no destructuring, que a revisão
    // pegou. Nenhum destes arquivos consulta a tabela por conta própria.
    for (const arquivo of [
      ['server', 'api', 'admin', 'features.get.ts'],
      ['server', 'api', 'admin', 'tenant.put.ts'],
      ['server', 'utils', 'tenant.ts'],
    ]) {
      const f = fonte(...arquivo)
      expect(f, `${arquivo.join('/')} não usa a fonte única`).toContain('areaClienteAtiva')
      expect(f, `${arquivo.join('/')} lê tenant_features direto`).not.toContain(
        "from('tenant_features')",
      )
    }
  })

  test('sem registro o recurso está DESLIGADO', () => {
    // O lado seguro para recurso pago: imobiliária nova não ganha a Área do
    // Cliente por esquecimento. É o estado de `tatiane` e `tres-lagoas` hoje.
    expect(recursoAtivo(null)).toBe(false)
    expect(recursoAtivo({ enabled: false, graceUntil: null })).toBe(false)
  })

  test('o padrão do painel quando a consulta falha é esconder', () => {
    const f = fonte('app', 'composables', 'useAdminFeatures.ts')
    expect(f).toContain('areaCliente: false')
    expect(f).toContain("=== true")
  })
})

describe('o interruptor do site público', () => {
  test('só aparece para quem tem o recurso', () => {
    // Ligar o link sem ter o recurso levaria o visitante a um login que recusa
    // todo mundo: a RLS fecha o portal quando `tenant_features` está desligado.
    const f = fonte('app', 'pages', 'admin', 'config.vue')
    const i = f.indexOf('v-if="areaCliente"')
    const j = f.indexOf('form.portalEnabled')
    expect(i, 'config.vue sem a condição do recurso').toBeGreaterThan(-1)
    expect(j, 'o interruptor sumiu').toBeGreaterThan(i)
  })
})

describe('o link no site público segue o recurso, não só o interruptor', () => {
  /**
   * ⚠️ O achado da revisão do PR #27, e o mais importante dos três: esconder o
   * interruptor impede LIGAR, não impede continuar ligado.
   *
   * O percurso é o desenho da suspensão, não um caso de borda: a imobiliária
   * liga o link enquanto usa o recurso; a carência vence; `tenant_features`
   * fica inativo; `tenants.portal_enabled` continua true, porque as colunas são
   * independentes — e o link segue no ar, levando o cliente a um login que
   * recusa todo mundo.
   */
  test('o payload devolve o valor EFETIVO, não a coluna crua', () => {
    const f = fonte('server', 'utils', 'tenant.ts')
    expect(f).toContain('comLinksEfetivos')
    expect(f).toContain('areaClienteAtiva')
    // Antes de cachear: o cache guarda o tenant pronto, e colapsar depois
    // deixaria a versão crua viver 60s na memória da instância.
    const iColapso = f.indexOf('await comLinksEfetivos(tenant)')
    const iCache = f.indexOf("setCached('host:' + hostname, tenant)")
    expect(iColapso).toBeGreaterThan(-1)
    expect(iCache).toBeGreaterThan(iColapso)
  })

  test('o header e o rodapé continuam lendo um campo só', () => {
    // Eles NÃO precisam mudar — é o payload que passou a ser honesto. Se algum
    // dia lerem outra coisa, esta trava avisa que a regra se espalhou.
    //
    // O rodapé lê direto. O header passou a montar a lista de itens numa função
    // pura (`shared/utils/header-menu.ts`), então a leitura mudou de arquivo —
    // mas NÃO de natureza, e é isso que este teste continua exigindo.
    expect(fonte('app', 'components', 'AppFooter.vue')).toContain('tenant?.portalEnabled')
    expect(fonte('shared', 'utils', 'header-menu.ts')).toContain('tenant?.portalEnabled')
  })

  test('nem o header nem o menu buscam o entitlement por fora', () => {
    // O negativo é o que dá força ao teste acima: um campo só, vindo do payload
    // público que já colapsa o valor efetivo. Ir buscar a verdade em outro lugar
    // — a tabela, o endpoint do painel, um segundo campo — desfaria o colapso
    // que existe por PRIVACIDADE: com duas fontes, "tem o recurso mas escondeu o
    // link" e "não tem o recurso" voltam a ser distinguíveis de fora.
    for (const arquivo of [
      ['app', 'components', 'AppHeader.vue'],
      ['app', 'components', 'AppFooter.vue'],
      ['shared', 'utils', 'header-menu.ts'],
    ]) {
      const f = fonte(...arquivo)
      for (const vazamento of ['areaClienteAtiva', 'tenant_features', 'api/admin/features']) {
        expect(f, `${arquivo.join('/')} não pode consultar ${vazamento}`).not.toContain(vazamento)
      }
    }
  })

  test('sem recurso, o PUT não grava portalEnabled', () => {
    // Duas portas que a seção escondida não fechava: a tela reenvia todos os
    // campos que declara a cada salvamento, e um PUT direto aceitava o campo.
    const f = fonte('server', 'api', 'admin', 'tenant.put.ts')
    expect(f).toContain('delete body.portalEnabled')
    expect(f).toContain('areaClienteAtiva')
    // E a resposta sai com o mesmo valor efetivo do GET.
    expect(f).toContain('updated.portalEnabled && temPortal')
  })

  test('a coluna crua é preservada, não zerada', () => {
    // Zerar faria a escolha da imobiliária sumir: quando o recurso voltasse,
    // ela teria que ligar de novo sem saber que foi desligada.
    const f = fonte('server', 'api', 'admin', 'tenant.put.ts')
    expect(f).not.toContain('portalEnabled: false')
  })
})

describe('a falha de leitura não vira estado nem silêncio', () => {
  test('o entitlement tem uma fonte só, que registra a falha', () => {
    // `assertSubmitRateLimit` fixou a convenção: engolir a falha da checagem,
    // mas deixar linha — "senão a proteção pode estar desligada há semanas sem
    // ninguém ver". Aqui o risco espelha: o recurso escondido há semanas.
    const f = fonte('server', 'utils', 'entitlement.ts')
    expect(f).toContain('logError(')
    expect(f).toContain('return false')
    // O erro do PostgREST não pode ser descartado no destructuring.
    expect(f).toContain('if (error)')
    // E `serviceSupabase()` lança sem chave: sem catch, derrubaria o site todo.
    expect(f).toContain('catch')
  })

  test('o painel NÃO guarda a falha como se fosse resposta', () => {
    // Uma falha de rede escondia o recurso pago pelo resto da sessão do SPA.
    const f = fonte('app', 'composables', 'useAdminFeatures.ts')
    const iCatch = f.indexOf('} catch {')
    const iFim = f.indexOf('}', f.indexOf('\n', iCatch))
    expect(iCatch).toBeGreaterThan(-1)
    expect(
      f.slice(iCatch, iFim),
      'o catch voltou a gravar estado: uma falha esconde o recurso pago',
    ).not.toContain('estado.value =')
  })

  test('chamadores concorrentes esperam a MESMA busca', () => {
    // Uma flag booleana faria o segundo chamador voltar com o estado nulo — e é
    // o `await carregar()` do middleware que decidiria o redirect antes da
    // resposta existir.
    const f = fonte('app', 'composables', 'useAdminFeatures.ts')
    expect(f).toContain('emVoo')
    expect(f).toContain('await emVoo')
    expect(f, 'flag booleana de carregando voltou').not.toContain('carregando.value')
  })
})
