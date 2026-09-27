import { describe, expect, it } from 'vitest'
import { cardQualifier, isNovo, NOVO_DIAS } from '../../shared/utils/property-badges'

const agora = new Date('2026-09-27T12:00:00Z')
const diasAtras = (d: number) => new Date(agora.getTime() - d * 86_400_000).toISOString()

describe('selo qualificador do card', () => {
  // O card só tem lugar para UM qualificador sobre a foto; o teste fixa quem
  // vence, porque trocar a ordem muda o que o visitante vê em todo o acervo.
  it('Exclusiva vence Novo e Alto padrão', () => {
    expect(cardQualifier({ exclusive: true, highStandard: true, createdAt: diasAtras(1) }, agora)).toBe('exclusiva')
  })

  it('Novo vence Alto padrão', () => {
    expect(cardQualifier({ highStandard: true, createdAt: diasAtras(3) }, agora)).toBe('novo')
  })

  it('Alto padrão quando não é exclusiva nem novo', () => {
    expect(cardQualifier({ highStandard: true, createdAt: diasAtras(200) }, agora)).toBe('alto_padrao')
  })

  it('nenhum qualificador', () => {
    expect(cardQualifier({ highStandard: false, createdAt: diasAtras(200) }, agora)).toBeNull()
  })
})

describe('isNovo', () => {
  it('vale até o dia anterior ao limite e expira no limite', () => {
    expect(isNovo(diasAtras(NOVO_DIAS - 1), agora)).toBe(true)
    expect(isNovo(diasAtras(NOVO_DIAS), agora)).toBe(false)
  })

  // Importação com data errada não pode deixar um imóvel "Novo" para sempre.
  it('data no futuro, inválida ou ausente não é novo', () => {
    expect(isNovo(diasAtras(-5), agora)).toBe(false)
    expect(isNovo('não é data', agora)).toBe(false)
    expect(isNovo(null, agora)).toBe(false)
  })
})
