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
  test('o endpoint do painel usa a MESMA função do portal', () => {
    // Duas implementações da carência discordariam por um dia — já aconteceu
    // neste repositório, com `graceUntil > now()` contra `>= current_date`.
    const f = fonte('server', 'api', 'admin', 'features.get.ts')
    expect(f).toContain('recursoAtivo(')
    expect(f).toContain("from('tenant_features')")
    // Service role: `tenant_features` não tem policy de leitura para o painel.
    expect(f).toContain('serviceSupabase()')
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
