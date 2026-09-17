/**
 * Forma de uuid — a checagem que evita transformar id malformado em erro 500.
 *
 * Todo id de rota deste sistema é `uuid` no banco. Mandar outra coisa para
 * `.eq('id', ...)` faz o Postgres devolver **22P02** (sintaxe inválida), o
 * repositório dá `throw error` e o handler responde 500 — para o que na prática
 * é "não existe".
 *
 * Nos endpoints do portal isso é mais que barulho: um 500 distingue aquele id
 * dos outros para quem está sondando a URL, e o portal inteiro foi escrito para
 * que "não é seu", "não existe" e "é rascunho" respondam igual.
 *
 * ⚠️ Mora em `shared/utils` e não junto do download porque não é do download:
 * serve todo caminho que recebe id de rota. Ela já esteve em
 * `portal-download.ts`, e o nome prometia um escopo menor do que o uso.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function ehUuid(valor: string | null | undefined): boolean {
  return UUID.test((valor || '').trim())
}
