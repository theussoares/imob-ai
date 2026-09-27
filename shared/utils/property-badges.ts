/**
 * Qual qualificador o card mostra sobre a foto, além de Venda/Aluguel.
 *
 * No máximo UM. Sobre a foto já estão o selo de pretensão e as setas do
 * carrossel; uma terceira etiqueta passa a disputar atenção com o que vende o
 * imóvel (o mesmo motivo que tirou o código de cima da foto). O que não cabe
 * aqui continua na página do imóvel.
 *
 * A ordem é a do que a pessoa NÃO deduz do resto do card:
 *  1. Exclusiva: nada no card diz "só esta imobiliária tem";
 *  2. Novo: nada no card diz "entrou esta semana", e é o que traz de volta
 *     quem já olhou o acervo inteiro;
 *  3. Alto padrão: o preço, logo abaixo, já diz quase o mesmo.
 *
 * Destaque NÃO é selo. Destaque é lugar (a faixa no topo da home), e selo em
 * 17 de 20 cards (o acervo real da tatiane em 26/09) ensina a ignorá-lo.
 */
export type CardQualifier = 'exclusiva' | 'novo' | 'alto_padrao'

export const CARD_QUALIFIER_LABELS: Record<CardQualifier, string> = {
  exclusiva: 'Exclusiva',
  novo: 'Novo',
  alto_padrao: 'Alto padrão',
}

/** Classe CSS de cada selo (ver `.badge.*` em main.css). */
export const QUALIFIER_CLASS: Record<CardQualifier, string> = {
  exclusiva: 'excl',
  novo: 'novo',
  alto_padrao: 'high',
}

/**
 * "Novo" sai sozinho da data de cadastro, sem campo no painel. Um selo que
 * depende de alguém lembrar de tirar vira "Novo" em imóvel de um ano atrás,
 * que é pior do que selo nenhum.
 *
 * 30 dias, não 7: acervo pequeno (a OLMI cadastra poucos por mês) passaria a
 * maior parte do tempo sem nenhum "Novo", e o selo perderia a função de dizer
 * "tem coisa nova aqui".
 */
export const NOVO_DIAS = 30

const DIA_MS = 24 * 60 * 60 * 1000

export function isNovo(createdAt: string | null | undefined, agora: Date): boolean {
  if (!createdAt) return false
  const t = Date.parse(createdAt)
  if (Number.isNaN(t)) return false
  const idade = agora.getTime() - t
  // Data no futuro (relógio torto, importação) não é "novo", é dado errado.
  return idade >= 0 && idade < NOVO_DIAS * DIA_MS
}

export function cardQualifier(
  p: { exclusive?: boolean; highStandard: boolean; createdAt?: string | null },
  agora: Date = new Date(),
): CardQualifier | null {
  if (p.exclusive) return 'exclusiva'
  if (isNovo(p.createdAt, agora)) return 'novo'
  if (p.highStandard) return 'alto_padrao'
  return null
}
