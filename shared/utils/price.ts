/**
 * Lê o preço digitado no campo do painel e devolve reais inteiros.
 *
 * O app não trabalha com centavos — o preço é inteiro no banco e é formatado
 * sem centavos em todo lugar. A questão é o que fazer quando a pessoa digita
 * centavos mesmo assim, e a resposta certa é **descartar**, não absorver.
 *
 * Antes, o campo apagava a vírgula junto com o resto da máscara: `350000,50`
 * virava `35000050`, ou seja R$ 35.000.050 — cem vezes o valor, gravado sem
 * nenhum aviso. Preço errado num anúncio de imóvel não é detalhe.
 *
 * Separadores, na convenção pt-BR:
 *  - vírgula é decimal → tudo depois dela é centavo e cai fora;
 *  - ponto é milhar → some;
 *  - exceção: ponto seguido de exatamente dois dígitos no fim também é centavo.
 *    Teclado numérico de notebook não tem vírgula, e "milhar de dois dígitos"
 *    não existe — então `350000.50` só pode ser tentativa de centavo.
 */
export function parsePriceInput(raw: string): number {
  let s = String(raw ?? '')

  // Vírgula presente: corta ali. Vale mesmo com nada depois (estado
  // intermediário de quem ainda vai digitar o centavo).
  const comma = s.indexOf(',')
  if (comma !== -1) s = s.slice(0, comma)
  else s = s.replace(/\.(\d{2})$/, '')

  const digits = s.replace(/\D/g, '')
  if (!digits) return 0
  const n = parseInt(digits, 10)
  return Number.isNaN(n) ? 0 : n
}
