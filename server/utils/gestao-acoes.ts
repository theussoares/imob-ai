import type { Ator, Estado, Resultado } from '~~/layers/gestao/domain/acoes'

/**
 * Despachante genérico de ações do gestão (venda hoje, locação na F4).
 *
 * O domínio é `(Estado, …, Ator, quando) => Resultado`, puro. Este arquivo é o
 * único lugar que sabe «carregar → rodar a regra → gravar com versão», para a
 * regra de concorrência e os códigos HTTP não serem reescritos por agregado.
 *
 * Códigos: 404 (não existe OU não é visível ao membro — `carregar` já aplica o
 * escopo, então um corretor não distingue «não existe» de «é de outro»);
 * 422 `{ erro }` quando a regra do domínio recusa; 409 quando outra pessoa
 * gravou entre a leitura e a escrita.
 */

export type AcaoPura = (estado: Estado, ator: Ator, quando: string) => Resultado

export const MSG_CONFLITO_VERSAO = 'Este processo foi alterado por outra pessoa. Recarregue.'

/**
 * Amarra ator e data à ação. Os dois vêm do SERVIDOR (membro logado e relógio
 * do servidor): histórico é auditoria, e ator/data do cliente seriam forjáveis.
 *
 * A assinatura de `executarAcao` (que as fases seguintes consomem) não carrega
 * ator nem data, então o despachante os fecha na própria `AcaoPura` e
 * `executarAcao` a chama com valores que ela ignora. Alternativa descartada:
 * incluir `ator`/`quando` em `opts` — mudaria a interface publicada no plano.
 */
export function amarrar(
  fn: (estado: Estado, ator: Ator, quando: string) => Resultado,
  ator: Ator,
  quando: string,
): AcaoPura {
  return (estado) => fn(estado, ator, quando)
}

const ATOR_IGNORADO: Ator = { nome: '' }

export async function executarAcao<T extends { id: string; versao: number }>(opts: {
  carregar: () => Promise<T | null>
  paraEstado: (a: T) => Estado
  doEstado: (e: Estado, antes: T) => T
  gravar: (novo: T, versaoAnterior: number) => Promise<'ok' | 'conflito'>
  acao: AcaoPura
}): Promise<T> {
  const antes = await opts.carregar()
  if (!antes) throw createError({ statusCode: 404, statusMessage: 'Não encontrado.' })

  const r = opts.acao(opts.paraEstado(antes), ATOR_IGNORADO, '')
  if (!r.ok) {
    // `data.erro` além do statusMessage: o cliente mostra a frase do domínio
    // sem depender de como o proxy trata o statusMessage.
    throw createError({ statusCode: 422, statusMessage: r.erro, data: { erro: r.erro } })
  }

  const novo: T = { ...opts.doEstado(r.estado, antes), versao: antes.versao + 1 }
  const gravado = await opts.gravar(novo, antes.versao)
  if (gravado === 'conflito') {
    throw createError({ statusCode: 409, statusMessage: MSG_CONFLITO_VERSAO, data: { erro: MSG_CONFLITO_VERSAO } })
  }
  return novo
}
