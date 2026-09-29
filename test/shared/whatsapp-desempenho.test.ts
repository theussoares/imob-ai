import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { duracao, resumoDeDesempenho, type ConversaParaDesempenho } from '~~/shared/models/whatsapp'

/**
 * Painel de desempenho — o número que o dono da imobiliária usa para cobrar a
 * equipe. Errar aqui é injustiça com o corretor (ou esconder o lead perdido),
 * então o que se trava: a base da medida (primeira mensagem ao vivo), o
 * percentil sem interpolação, e "sem resposta" nunca sumir na média.
 */

const agora = new Date('2026-09-29T12:00:00Z')
const conv = (min: number | null, broker: string | null = null): ConversaParaDesempenho => ({
  firstInboundAt: '2026-09-29T08:00:00Z',
  firstResponseAt: min === null ? null : new Date(Date.parse('2026-09-29T08:00:00Z') + min * 60000).toISOString(),
  brokerId: broker,
  brokerName: broker ? `Corretor ${broker}` : null,
})

describe('resumo', () => {
  const cs = [conv(2, 'a'), conv(10, 'a'), conv(45, 'b'), conv(180, 'b'), conv(2000, 'b'), conv(null, 'a'), conv(null)]
  const r = resumoDeDesempenho(7, cs, [{ lastMessageAt: '2026-09-29T11:30:00Z' }, { lastMessageAt: '2026-09-29T10:00:00Z' }], agora)

  test('faixas somam o total, e "sem resposta" é faixa própria', () => {
    expect(Object.fromEntries(r.faixas.map((f) => [f.chave, f.n]))).toEqual({ ate5: 1, ate30: 1, ate2h: 1, ate24h: 1, mais24h: 1, sem: 2 })
    expect(r.faixas.reduce((a, f) => a + f.n, 0)).toBe(r.total)
  })

  test('mediana e p90 só das respondidas, pelo posto mais próximo (um tempo que aconteceu)', () => {
    expect(r.respondidas).toBe(5)
    expect(r.semResposta).toBe(2)
    expect(r.medianaMin).toBe(45)
    expect(r.p90Min).toBe(2000)
  })

  test('por corretor do contato; sem corretor aparece como tal', () => {
    const a = r.porCorretor.find((c) => c.brokerId === 'a')!
    expect(a).toMatchObject({ nome: 'Corretor a', total: 3, respondidas: 2, semResposta: 1, medianaMin: 2 })
    expect(r.porCorretor.find((c) => c.brokerId === null)?.nome).toBe('Sem corretor')
  })

  test('quem está esperando agora, e há quanto tempo a mais antiga', () => {
    expect(r.esperandoAgora).toBe(2)
    expect(r.maiorEsperaMin).toBe(120)
  })

  test('sem conversa: nada inventado', () => {
    const vazio = resumoDeDesempenho(7, [], [], agora)
    expect(vazio).toMatchObject({ total: 0, medianaMin: null, p90Min: null, esperandoAgora: 0, maiorEsperaMin: null })
  })
})

describe('duração legível', () => {
  test.each([
    [null, '—'],
    [0.4, 'menos de 1 min'],
    [4, '4 min'],
    [80, '1 h 20 min'],
    [120, '2 h'],
    [2880, '2 dias'],
  ])('%s → %s', (min, txt) => expect(duracao(min)).toBe(txt))
})

describe('a base da medida', () => {
  test('a primeira entrada ao vivo marca first_inbound_at; o histórico nunca', () => {
    const inbox = readFileSync(join(process.cwd(), 'server/utils/whatsapp-inbox.ts'), 'utf8')
    expect(inbox).toContain('if (!state.firstInboundAt) patch.first_inbound_at = m.quando')
    const historico = readFileSync(join(process.cwd(), 'server/utils/whatsapp-historico.ts'), 'utf8')
    expect(historico).not.toContain('first_inbound_at')
  })
})
