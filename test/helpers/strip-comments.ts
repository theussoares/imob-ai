/**
 * Remove comentários de bloco (`/* ... *\/`) e de linha inteira (`// ...`) de
 * um texto-fonte.
 *
 * Existe para guardrail que lê `.ts` como TEXTO (varredura estática, sem
 * compilar nada) não confundir uma chamada citada em comentário com a chamada
 * real. O caso que motivou isto: `descricao.post.ts` satisfazia
 * `test/server/id-de-rota.test.ts` só porque o texto "ehUuid(" aparecia num
 * comentário explicativo — a validação de verdade morava em outro arquivo, e
 * o endpoint podia trocar a checagem por um `getRouterParam` cru sem o teste
 * perceber.
 *
 * ⚠️ Não mexe em comentário `//` que vem DEPOIS de código na mesma linha
 * (`const x = 1 // nota`) — nenhum guardrail deste repositório precisou disso
 * até agora, e um regex mais agressivo arrisca cortar string literal que
 * contenha `//` (uma URL, por exemplo).
 */
export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}
