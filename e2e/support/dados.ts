// Import RELATIVO, não `~~/shared/...`.
//
// O alias `~~` é do Nuxt e existe no `vitest.config.ts`; o Playwright roda fora
// dos dois e não resolveria. Errar isto custa um "Cannot find module" que parece
// erro de tipo e não é.
import type { ContractPartyRole } from '../../shared/models/portal'

export type ChaveDoc = 'contrato' | 'vistoria' | 'boleto' | 'extrato' | 'administracao' | 'rascunho'

/**
 * A matriz da spec, como dado — e a fonte única das asserções.
 *
 * Fica aqui, e não espalhada nos specs, porque quem muda a regra de audiência
 * precisa ver num lugar só o que cada papel deixa de enxergar. `audiencia` repete
 * de propósito o resultado de `defaultAudienceFor`: se a função mudar, o teste
 * falha em vez de acompanhar em silêncio — que é o ponto de ter o teste.
 */
export const DOCUMENTOS: Record<
  ChaveDoc,
  { titulo: string; categoria: string; audiencia: ContractPartyRole[]; publicado: boolean }
> = {
  contrato: {
    titulo: 'Contrato de locação assinado',
    categoria: 'contrato',
    audiencia: ['inquilino', 'proprietario', 'fiador'],
    publicado: true,
  },
  vistoria: {
    titulo: 'Vistoria de entrada',
    categoria: 'vistoria',
    audiencia: ['inquilino', 'proprietario', 'fiador'],
    publicado: true,
  },
  boleto: {
    titulo: 'Boleto de setembro',
    categoria: 'boleto',
    audiencia: ['inquilino'],
    publicado: true,
  },
  extrato: {
    titulo: 'Extrato de repasse de setembro',
    categoria: 'extrato',
    audiencia: ['proprietario'],
    publicado: true,
  },
  administracao: {
    titulo: 'Contrato de administração',
    categoria: 'contrato_administracao',
    audiencia: ['proprietario'],
    publicado: true,
  },
  rascunho: {
    titulo: 'Recibo de outubro (rascunho)',
    categoria: 'recibo',
    audiencia: ['inquilino'],
    publicado: false,
  },
}

/** Quantos documentos cada papel deve enxergar. Derivado da matriz acima. */
export const ESPERADO: Record<ContractPartyRole, number> = {
  inquilino: 3,
  proprietario: 4,
  fiador: 2,
}
