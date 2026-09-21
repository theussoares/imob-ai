// Import RELATIVO, não `~~/shared/...`.
//
// O alias `~~` é do Nuxt e existe no `vitest.config.ts`; o Playwright roda fora
// dos dois e não resolveria. Errar isto custa um "Cannot find module" que parece
// erro de tipo e não é.
import type { ContractPartyRole, PortalDocCategory } from '../../shared/models/portal'
import { defaultAudienceFor } from '../../shared/utils/portal-access'

export type ChaveDoc = 'contrato' | 'vistoria' | 'boleto' | 'extrato' | 'administracao' | 'rascunho'

/**
 * A matriz da spec, como dado — e a fonte única das asserções.
 *
 * Fica aqui, e não espalhada nos specs, porque quem muda a regra de audiência
 * precisa ver num lugar só o que cada papel deixa de enxergar. `audiencia` vem
 * de `defaultAudienceFor(categoria)`, não de um literal repetido à mão: um
 * literal aqui só documentaria a promessa de acompanhar a função, sem cumprir
 * — nada em `e2e/` importava `defaultAudienceFor` antes desta linha, e mudar o
 * default de uma categoria (ex.: `boleto`) não fazia a suíte reagir. Derivando
 * de verdade, se o default mudar, `ESPERADO` abaixo (que continua fixo, de
 * propósito) deixa de bater com o que `DOCUMENTOS` semeia, e os testes de
 * `audiencia.spec.ts` ficam vermelhos — é o ponto de ter o teste.
 */
export const DOCUMENTOS: Record<
  ChaveDoc,
  { titulo: string; categoria: PortalDocCategory; audiencia: ContractPartyRole[]; publicado: boolean }
> = {
  contrato: {
    titulo: 'Contrato de locação assinado',
    categoria: 'contrato',
    audiencia: defaultAudienceFor('contrato'),
    publicado: true,
  },
  vistoria: {
    titulo: 'Vistoria de entrada',
    categoria: 'vistoria',
    audiencia: defaultAudienceFor('vistoria'),
    publicado: true,
  },
  boleto: {
    titulo: 'Boleto de setembro',
    categoria: 'boleto',
    audiencia: defaultAudienceFor('boleto'),
    publicado: true,
  },
  extrato: {
    titulo: 'Extrato de repasse de setembro',
    categoria: 'extrato',
    audiencia: defaultAudienceFor('extrato'),
    publicado: true,
  },
  administracao: {
    titulo: 'Contrato de administração',
    categoria: 'contrato_administracao',
    audiencia: defaultAudienceFor('contrato_administracao'),
    publicado: true,
  },
  rascunho: {
    titulo: 'Recibo de outubro (rascunho)',
    categoria: 'recibo',
    audiencia: defaultAudienceFor('recibo'),
    publicado: false,
  },
}

/** Quantos documentos cada papel deve enxergar. Derivado da matriz acima. */
export const ESPERADO: Record<ContractPartyRole, number> = {
  inquilino: 3,
  proprietario: 4,
  fiador: 2,
}
