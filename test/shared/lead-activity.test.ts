import { describe, expect, test } from 'vitest'
import { LEAD_LOST_REASON_LABELS, LEAD_STAGE_LABELS } from '~~/shared/models/lead'
import { agendaBucket, eventosDaMudanca } from '~~/shared/models/lead-activity'

const labels = { stage: LEAD_STAGE_LABELS, lostReason: LEAD_LOST_REASON_LABELS }
const nome = (id: string) => (id === 'b1' ? 'Ana' : null)

/**
 * O histórico vale como prova de atendimento. Estes testes travam o que ele
 * diz quando o lead muda — e, tão importante quanto, quando NÃO diz nada.
 */
describe('eventosDaMudanca', () => {
  test('salvar sem mudar etapa nem responsável não suja o histórico', () => {
    expect(eventosDaMudanca({ stage: 'contato', brokerId: 'b1' }, { stage: 'contato', brokerId: 'b1', lostReason: null }, nome, labels)).toEqual([])
  })

  test('mudança de etapa registra de onde para onde', () => {
    const [e] = eventosDaMudanca({ stage: 'novo', brokerId: null }, { stage: 'visita', brokerId: null, lostReason: null }, nome, labels)
    expect(e).toEqual({ kind: 'etapa', body: 'Novo → Visita', meta: { from: 'novo', to: 'visita' } })
  })

  test('perda leva o motivo no texto e no meta — é o relatório de perdas', () => {
    const [e] = eventosDaMudanca({ stage: 'proposta', brokerId: null }, { stage: 'perdido', brokerId: null, lostReason: 'preco' }, nome, labels)
    expect(e!.body).toBe('Proposta → Perdido (Preço)')
    expect(e!.meta.lostReason).toBe('preco')
  })

  test('atribuição grava o NOME: daqui a um ano ninguém reconhece um uuid', () => {
    const [e] = eventosDaMudanca({ stage: 'novo', brokerId: null }, { stage: 'novo', brokerId: 'b1', lostReason: null }, nome, labels)
    expect(e).toEqual({ kind: 'atribuicao', body: 'Atribuído a Ana', meta: { brokerId: 'b1' } })
  })

  test('tirar o responsável também é registrado', () => {
    const [e] = eventosDaMudanca({ stage: 'novo', brokerId: 'b1' }, { stage: 'novo', brokerId: null, lostReason: null }, nome, labels)
    expect(e!.body).toBe('Sem responsável')
  })
})

describe('agendaBucket', () => {
  // 25/09/2026 às 22h em São Paulo = 26/09 01h em UTC.
  const noiteEmSP = new Date('2026-09-26T01:00:00Z')

  test('"hoje" é o dia de São Paulo, não o do servidor em UTC', () => {
    // Visita às 23h de SP do mesmo dia: em UTC já seria "amanhã".
    expect(agendaBucket('2026-09-26T02:00:00Z', noiteEmSP)).toBe('hoje')
    // Meio-dia de SP do dia seguinte: não é hoje, mesmo sendo "hoje" em UTC.
    expect(agendaBucket('2026-09-26T15:00:00Z', noiteEmSP)).toBe('proximas')
  })

  test('passou da hora e não foi concluída: atrasada, mesmo sendo de hoje', () => {
    expect(agendaBucket('2026-09-25T12:00:00Z', noiteEmSP)).toBe('atrasadas')
  })

  test('além de sete dias vai para "depois"', () => {
    expect(agendaBucket('2026-10-10T15:00:00Z', noiteEmSP)).toBe('depois')
  })
})
