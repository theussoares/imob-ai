import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { matrizPadrao } from '~~/layers/gestao/domain/permissions'
import { ACOES_LOCACAO, corpoAcaoSchema, permitidoNaLocacao } from '~~/server/utils/gestao-locacao-acoes'
import { agoraBrasil } from '~~/server/utils/gestao-tempo'

describe('mapa de ações da locação', () => {
  test('cobre as 12 ações do plano, e só elas', () => {
    expect(Object.keys(ACOES_LOCACAO).sort()).toEqual(
      [
        'arquivarLocacao', 'concluirEtapaLocacao', 'encerrarLocacao', 'gerarCobranca', 'registrarPagamento',
        'registrarRepasse', 'renovarLocacao', 'restaurarLocacao', 'salvarAberturaLocacao', 'salvarContrato',
        'salvarGarantia', 'salvarVistoria',
      ].sort(),
    )
  })

  test('toda ação financeira exige «valores»; arquivar exige «arquivar»', () => {
    for (const a of ['salvarContrato', 'gerarCobranca', 'registrarPagamento', 'registrarRepasse']) {
      expect(ACOES_LOCACAO[a]!.permissao({})).toEqual(['valores'])
    }
    expect(ACOES_LOCACAO.arquivarLocacao!.permissao({})).toEqual(['arquivar'])
    expect(ACOES_LOCACAO.restaurarLocacao!.permissao({})).toEqual(['arquivar'])
  })

  test('concluir a etapa 7 é do financeiro; as demais, da edição', () => {
    expect(ACOES_LOCACAO.concluirEtapaLocacao!.permissao({ etapa: 7 })).toEqual(['valores'])
    expect(ACOES_LOCACAO.concluirEtapaLocacao!.permissao({ etapa: 2 })).toEqual(['editar'])
  })

  test('o corpo não injeta campo do agregado: status, etapa, tenant e arquivado são descartados', () => {
    const r = ACOES_LOCACAO.salvarGarantia!.schema.parse({ tipo: 'Caução', detalhe: 'x', status: 'Ativa', etapa: 8, tenantId: 'outro', arquivado: true })
    expect(r).toEqual({ tipo: 'Caução', detalhe: 'x' })
  })

  test('dados inválidos são recusados', () => {
    expect(ACOES_LOCACAO.salvarGarantia!.schema.safeParse({ tipo: 'Hipoteca', detalhe: '' }).success).toBe(false)
    expect(ACOES_LOCACAO.registrarPagamento!.schema.safeParse({ cobrancaId: 'x', data: '17/11', comprovante: 'a' }).success).toBe(false)
    expect(corpoAcaoSchema.safeParse({ acao: 'arquivarLocacao' }).success).toBe(false) // sem versao
    expect(corpoAcaoSchema.safeParse({ acao: 'arquivarLocacao', versao: 0 }).success).toBe(false)
  })

  test('contrato vazio chega à regra do domínio, que tem a mensagem certa', () => {
    expect(ACOES_LOCACAO.salvarContrato!.schema.safeParse({ valor: '', diaVencimento: null, inicio: '2026-01-01', fim: '2027-01-01', reajuste: 'IPCA', taxaPct: '' }).success).toBe(true)
  })
})

describe('permitidoNaLocacao', () => {
  const m = matrizPadrao()
  const meu = { corretorId: 'b1' }
  const deOutro = { corretorId: 'b2' }

  test('«proprio» só vale na locação do corretor logado', () => {
    expect(permitidoNaLocacao(m, 'corretor', 'b1', ['editar'], meu)).toBe(true)
    expect(permitidoNaLocacao(m, 'corretor', 'b1', ['editar'], deOutro)).toBe(false)
    expect(permitidoNaLocacao(m, 'corretor', null, ['editar'], meu)).toBe(false)
  })

  test('«nao» nunca passa; basta uma chave da lista', () => {
    expect(permitidoNaLocacao(m, 'recepcao', null, ['valores'], meu)).toBe(false)
    expect(permitidoNaLocacao(m, 'juridico', null, ['editar', 'valores'], meu)).toBe(true)
  })
})

describe('relógio do painel (Campo Grande, UTC-4)', () => {
  test('21h em Campo Grande ainda é o mesmo dia, embora seja 01h UTC do dia seguinte', () => {
    const d = agoraBrasil(new Date('2026-11-18T01:00:00Z'))
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours()]).toEqual([2026, 11, 17, 21])
  })
})

describe('invariante 1 nos arquivos novos', () => {
  const lê = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8')
  test('nenhum endpoint/caso de uso lê tenant, perfil ou corretor do corpo', () => {
    const fontes = [
      lê('server', 'utils', 'gestao-locacao-servico.ts'),
      lê('server', 'api', 'gestao', 'locacoes.post.ts'),
      lê('server', 'api', 'gestao', 'locacoes', '[id]', 'acoes.post.ts'),
    ].join('\n')
    expect(fontes).not.toMatch(/(body|corpo|d|c\.data)\.tenant/i)
    expect(fontes).not.toMatch(/useTenantContext/) // tenant sai do requireGestaoMember
  })
})

describe('idDeLocacao', () => {
  test('aceita L-AAAA-NNNN e recusa o resto com 400', async () => {
    const { idDeLocacao } = await import('~~/server/utils/gestao-locacao-servico')
    expect(idDeLocacao(' L-2026-0001 ')).toBe('L-2026-0001')
    for (const ruim of [undefined, null, '', 'abc', "L-2026-1'; --", '../x', 'L-26-1']) {
      expect(() => idDeLocacao(ruim), String(ruim)).toThrow(expect.objectContaining({ statusCode: 400 }))
    }
  })
})
