import { describe, expect, test } from 'vitest'
import {
  canClientSeeDocument,
  defaultAudienceFor,
  describeAudience,
  recursoAtivo,
  visibleDocumentsFor,
} from '~~/shared/utils/portal-access'
import {
  PORTAL_DOC_CATEGORIES,
  PORTAL_DOC_HINTS,
  PORTAL_DOC_LABELS,
  type ContractPartyRole,
  type PortalDocCategory,
} from '~~/shared/models/portal'

const PUBLICADO = '2026-09-01T12:00:00.000Z'

describe('canClientSeeDocument', () => {
  test('o inquilino vê o boleto endereçado a ele', () => {
    expect(
      canClientSeeDocument({ audience: ['inquilino'], publishedAt: PUBLICADO }, ['inquilino']),
    ).toBe(true)
  })

  test('o proprietário NÃO vê o boleto do inquilino', () => {
    // O vazamento mais caro desta feature: o dono do imóvel descobrindo os
    // dados de pagamento de quem mora lá.
    expect(
      canClientSeeDocument({ audience: ['inquilino'], publishedAt: PUBLICADO }, ['proprietario']),
    ).toBe(false)
  })

  test('o inquilino NÃO vê o extrato de repasse do proprietário', () => {
    // E o espelho dele: quanto a imobiliária repassa ao dono não é assunto de
    // quem aluga.
    expect(
      canClientSeeDocument({ audience: ['proprietario'], publishedAt: PUBLICADO }, ['inquilino']),
    ).toBe(false)
  })

  test('rascunho não é visível nem para quem é do contrato', () => {
    // A imobiliária sobe 12 boletos ao longo do dia; o cliente não pode ver a
    // lista pela metade e ligar perguntando do que falta.
    expect(
      canClientSeeDocument({ audience: ['inquilino'], publishedAt: null }, ['inquilino']),
    ).toBe(false)
  })

  test('quem não é parte do contrato não vê nada, mesmo publicado', () => {
    expect(canClientSeeDocument({ audience: ['inquilino'], publishedAt: PUBLICADO }, [])).toBe(false)
  })

  test('quem acumula papéis vê pelos dois', () => {
    // Aluga um imóvel e é dono de outro: mesma conta, papéis diferentes por
    // contrato. Basta um papel bater.
    const roles: ContractPartyRole[] = ['inquilino', 'proprietario']
    expect(canClientSeeDocument({ audience: ['proprietario'], publishedAt: PUBLICADO }, roles)).toBe(
      true,
    )
  })

  test('audiência vazia não vaza para ninguém', () => {
    expect(canClientSeeDocument({ audience: [], publishedAt: PUBLICADO }, ['inquilino'])).toBe(false)
  })
})

describe('visibleDocumentsFor', () => {
  test('devolve só o que é do papel de quem pediu', () => {
    const docs = [
      { id: 'contrato', audience: ['inquilino', 'proprietario'] as ContractPartyRole[], publishedAt: PUBLICADO },
      { id: 'boleto', audience: ['inquilino'] as ContractPartyRole[], publishedAt: PUBLICADO },
      { id: 'extrato', audience: ['proprietario'] as ContractPartyRole[], publishedAt: PUBLICADO },
      { id: 'rascunho', audience: ['proprietario'] as ContractPartyRole[], publishedAt: null },
    ]
    expect(visibleDocumentsFor(docs, ['proprietario']).map((d) => d.id)).toEqual([
      'contrato',
      'extrato',
    ])
  })
})

describe('defaultAudienceFor', () => {
  test('dinheiro que entra é do inquilino, dinheiro que sai é do proprietário', () => {
    expect(defaultAudienceFor('boleto')).toEqual(['inquilino'])
    expect(defaultAudienceFor('recibo')).toEqual(['inquilino'])
    expect(defaultAudienceFor('extrato')).toEqual(['proprietario'])
  })

  test('contrato de locação e vistoria valem para todo mundo que assinou', () => {
    expect(defaultAudienceFor('contrato')).toEqual(['inquilino', 'proprietario', 'fiador'])
    expect(defaultAudienceFor('vistoria')).toEqual(['inquilino', 'proprietario', 'fiador'])
  })

  test('contrato de administração é só do proprietário', () => {
    // O documento real traz a taxa de administração (10%), a conta bancária e a
    // chave Pix do dono do imóvel. O inquilino não é parte deste contrato.
    expect(defaultAudienceFor('contrato_administracao')).toEqual(['proprietario'])
  })

  test('categoria genérica não inclui o fiador por engano', () => {
    expect(defaultAudienceFor('outro')).toEqual(['inquilino', 'proprietario'])
  })

  test('nenhum default entrega ao inquilino um documento do proprietário', () => {
    // Trava de rede, não repetição dos casos acima: se uma categoria nova
    // entrar no enum sem passar por este arquivo, ela cai no `default` e o teste
    // continua passando — mas o dia em que alguém apontar uma categoria de dono
    // para a audiência das duas pontas, este teste cai junto.
    const soDoProprietario: PortalDocCategory[] = ['extrato', 'contrato_administracao']
    for (const categoria of soDoProprietario) {
      expect(defaultAudienceFor(categoria)).not.toContain('inquilino')
      expect(defaultAudienceFor(categoria)).not.toContain('fiador')
    }
  })

  test('toda categoria do enum tem default, rótulo e explicação', () => {
    // Impede que uma categoria nova chegue ao formulário sem audiência pensada:
    // sem esta trava, ela herda o `default` ['inquilino','proprietario'] em
    // silêncio, que é o lado inseguro para qualquer documento de dono.
    for (const categoria of PORTAL_DOC_CATEGORIES) {
      expect(defaultAudienceFor(categoria).length).toBeGreaterThan(0)
      expect(PORTAL_DOC_LABELS[categoria]).toBeTruthy()
      expect(PORTAL_DOC_HINTS[categoria]).toBeTruthy()
    }
  })
})

describe('describeAudience', () => {
  test('diz em uma frase quem vê', () => {
    expect(describeAudience(['proprietario'])).toBe('Só o proprietário vê')
    expect(describeAudience(['inquilino'])).toBe('Só o inquilino vê')
    expect(describeAudience(['inquilino', 'proprietario'])).toBe(
      'inquilino e proprietário veem',
    )
    expect(describeAudience(['inquilino', 'proprietario', 'fiador'])).toBe(
      'inquilino, proprietário e fiador veem',
    )
  })

  test('a mesma audiência produz a mesma frase, venha na ordem que vier', () => {
    // Sem a ordenação canônica a tela alterna entre duas frases para o mesmo
    // estado, e quem lê acha que mudou alguma coisa.
    expect(describeAudience(['proprietario', 'inquilino'])).toBe(
      describeAudience(['inquilino', 'proprietario']),
    )
  })

  test('audiência vazia é dita, não omitida', () => {
    // É o que sobra quando alguém desmarca tudo. Falhar calado aqui publica um
    // arquivo que o cliente jura não existir.
    expect(describeAudience([])).toBe('Ninguém vê este documento')
  })

  test('a frase descreve o default de verdade de cada categoria', () => {
    // A trava que justifica derivar em vez de repetir texto: se a audiência de
    // uma categoria mudar, é aqui que o rótulo antigo cai.
    expect(describeAudience(defaultAudienceFor('contrato_administracao'))).toBe(
      'Só o proprietário vê',
    )
    expect(describeAudience(defaultAudienceFor('extrato'))).toBe('Só o proprietário vê')
    expect(describeAudience(defaultAudienceFor('boleto'))).toBe('Só o inquilino vê')
  })
})

describe('recursoAtivo — o entitlement da Área do Cliente', () => {
  const AGORA = new Date('2026-09-16T12:00:00.000Z')

  test('sem registro é DESLIGADO, não ligado', () => {
    // O lado seguro para um recurso pago: tenant novo não ganha a Área do
    // Cliente por esquecimento de cadastro.
    expect(recursoAtivo(null, AGORA)).toBe(false)
    expect(recursoAtivo(undefined, AGORA)).toBe(false)
  })

  test('ligado vale, independentemente da carência', () => {
    expect(recursoAtivo({ enabled: true, graceUntil: null }, AGORA)).toBe(true)
    expect(recursoAtivo({ enabled: true, graceUntil: '2020-01-01' }, AGORA)).toBe(true)
  })

  test('desligado sem carência não vale', () => {
    expect(recursoAtivo({ enabled: false, graceUntil: null }, AGORA)).toBe(false)
  })

  test('desligado COM carência no futuro ainda vale', () => {
    // É a régua do plano: desliga na hora do vencimento, corta em D+15. Entre
    // as duas coisas o cliente final continua acessando os documentos dele —
    // que é o que a LGPD protege, e o que o precedente citado no plano exige.
    expect(recursoAtivo({ enabled: false, graceUntil: '2026-10-01T00:00:00Z' }, AGORA)).toBe(true)
  })

  test('carência vencida não vale', () => {
    expect(recursoAtivo({ enabled: false, graceUntil: '2026-09-01T00:00:00Z' }, AGORA)).toBe(false)
  })

  test('data inválida não vira carência infinita', () => {
    // `NaN > x` é falso, mas deixar passar esconderia dado corrompido.
    expect(recursoAtivo({ enabled: false, graceUntil: 'nao-e-data' }, AGORA)).toBe(false)
  })
})
