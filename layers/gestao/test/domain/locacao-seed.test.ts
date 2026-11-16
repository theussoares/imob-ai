import { describe, expect, it } from 'vitest'
import { documentosLocacaoSeed, locacoesSeed } from '../../domain/locacao-seed'
import { pendenciasEtapaLocacao } from '../../domain/locacao-requisitos'
import { STATUS_LOCACAO } from '../../domain/locacao-status'

describe('seed da locação', () => {
  it('cobre situações diferentes', () => {
    const status = new Set(locacoesSeed().map((l) => l.status))
    expect(status).toEqual(new Set(['Em abertura', 'Aguardando garantia', 'Ativa', 'Encerrada']))
    expect([...status].every((s) => STATUS_LOCACAO.includes(s))).toBe(true)
  })

  it('etapas marcadas como concluídas não têm pendência', () => {
    const docs = documentosLocacaoSeed()
    for (const l of locacoesSeed()) {
      l.concluidas.forEach((feita, i) => {
        if (feita && i + 1 <= 7) expect(pendenciasEtapaLocacao(l, docs, i + 1), `${l.id} etapa ${i + 1}`).toEqual([])
      })
    }
  })
})
