import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

/**
 * Cobrança é recurso próprio (0055), separado da Área do Cliente.
 *
 * O motivo: `portal` está ligado para imobiliária de verdade (a OLMI), e a
 * cobrança entrou atrás dele — o release a mostraria a quem não contratou.
 * Diferente dos outros recursos, aqui a trava também é do SERVIDOR: é dinheiro,
 * e um membro chamando a API direto não pode conectar conta nem gerar cobrança.
 *
 * Travas que leem o fonte, como `area-cliente-por-tenant.test.ts`: o modo de
 * falha é uma linha esquecida, que não quebra nada.
 */
function fonte(...partes: string[]): string {
  return readFileSync(join(process.cwd(), ...partes), 'utf8')
}

describe('cobrança segue o recurso', () => {
  test('toda operação que INICIA dinheiro exige o recurso no servidor', () => {
    const rotas = [
      ['server', 'api', 'admin', 'cobranca', 'conta.put.ts'],
      ['server', 'api', 'admin', 'contracts', '[id]', 'cobrancas.post.ts'],
      ['server', 'api', 'admin', 'cobrancas', '[id]', 'emitir.post.ts'],
      ['server', 'api', 'admin', 'cobrancas', '[id]', 'simular-pagamento.post.ts'],
      ['server', 'api', 'admin', 'contracts', '[id]', 'repasse.put.ts'],
    ]
    for (const r of rotas) expect(fonte(...r), r.join('/')).toContain('await exigirCobranca(tenant.id)')
    expect(fonte('server', 'api', 'admin', 'contracts', 'locacao.post.ts')).toMatch(/if \(body\.repasse\) await exigirCobranca/)
  })

  test('o portal não mostra boleto de imobiliária sem o recurso', () => {
    expect(fonte('server', 'api', 'portal', 'contratos', '[id]', 'cobrancas.get.ts')).toMatch(/if \(!\(await cobrancaAtiva\(tenant\.id\)\)\) return \[\]/)
  })

  test('o painel esconde cobranças, repasse, pendências e a conta do Asaas', () => {
    const ficha = fonte('app', 'pages', 'admin', 'contratos', '[id].vue')
    expect(ficha).toMatch(/<AdminContratoCobrancas v-if="temCobranca"/)
    expect(ficha).toMatch(/<div v-if="temCobranca" class="repasse">/)
    expect(ficha).toMatch(/v-if="temCobranca && form\.status === 'ativo' && pendencias\.length"/)
    expect(fonte('app', 'pages', 'admin', 'config.vue')).toContain('<AdminCobrancaConta v-if="areaCliente && cobranca" />')
    expect(fonte('app', 'pages', 'admin', 'contratos', 'novo.vue')).toContain('<fieldset v-if="temCobranca && f.proprietario"')
  })

  test('a constraint da 0055 mantém os recursos que já existiam', () => {
    expect(fonte('supabase', 'migrations', '0055_recurso_cobranca.sql')).toContain(
      "check (feature in ('portal', 'about', 'ai', 'crm', 'cobranca'))",
    )
  })
})
