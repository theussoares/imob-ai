import type { Tenant } from '~~/shared/models/tenant'

/** Destino do menu do site. */
export interface ItemDoMenu {
  label: string
  /** Rota interna, ou URL completa quando `externo`. */
  to: string
  /** WhatsApp: vira `<a target="_blank">` em vez de `<NuxtLink>`. */
  externo?: boolean
}

/**
 * Página única para "vender" e "alugar", de propósito.
 *
 * Quem quer alugar o próprio imóvel procura a palavra "alugar" e não se
 * reconhece em "quero vender" — mas o conteúdo que ele precisa é o mesmo. Dois
 * rótulos apontando para uma página custam menos que uma segunda página para
 * manter atualizada, e o rodapé já resolve o mesmo problema pelo outro lado,
 * com o rótulo combinado "Quero vender ou alugar".
 */
const PRETENSAO = '/quero-vender'

/** Para onde o menu manda de volta: a home É o catálogo neste app. */
const CATALOGO = '/'

/** Ignora a barra final: `/quero-vender` e `/quero-vender/` são a mesma página. */
function mesmaPagina(rota: string | undefined, destino: string): boolean {
  if (!rota) return false
  const podar = (p: string) => (p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p)
  return podar(rota) === podar(destino)
}

/**
 * O que aparece no header desta imobiliária.
 *
 * Função pura, fora do componente, porque a regra abaixo já quebrou duas vezes
 * e quebra **sem erro** — o link continua renderizando, só que para quem não
 * devia vê-lo.
 *
 * ⚠️ **Só a Área do Cliente depende do plano.** "Quero alugar" e "Quero vender"
 * servem a qualquer imobiliária: condicionar o menu inteiro ao entitlement
 * faria esses dois destinos existirem apenas para quem contratou o portal — o
 * item errado a amarrar. O que depende do plano é UM item, não o menu.
 *
 * E o oposto custou caro: até o PR #27 o painel oferecia Contratos e Clientes a
 * toda imobiliária, sem condição nenhuma. Do lado do site, o equivalente leva o
 * visitante a um login onde ninguém tem conta.
 *
 * A ordem é fixa e não segue a ordem das condições: menu que reordena entre
 * páginas faz a pessoa procurar o mesmo item duas vezes.
 */
export function itensDoMenu(
  tenant: Pick<Tenant, 'portalEnabled' | 'whatsapp'> | null | undefined,
  whatsappHref: string,
  rotaAtual?: string,
): ItemDoMenu[] {
  const itens: ItemDoMenu[] = []

  if (tenant?.portalEnabled) {
    itens.push({ label: 'Área do Cliente', to: '/area-cliente' })
  }

  /**
   * Na própria página de pretensão, os dois rótulos viram link morto.
   *
   * Eram TRÊS itens e DOIS apontavam para a página aberta. No celular a conta
   * fica pior: a pessoa toca no burger e dois terços do painel não levam a
   * lugar nenhum.
   *
   * ⚠️ O padrão usual seria MARCAR o item atual (`aria-current`), não removê-lo
   * — menu que muda de página para página faz procurar duas vezes. Ele não
   * serve aqui por causa da decisão de dois rótulos para uma página só: marcar
   * "o atual" acenderia os dois ao mesmo tempo, e duas coisas destacadas juntas
   * lê como defeito, não como orientação.
   *
   * A troca é no LUGAR, não na ordem: o item de volta herda a vaga das
   * pretensões, entre a Área do Cliente e o WhatsApp, então nada em volta muda
   * de posição — que é o que o teste da ordem canônica protege.
   *
   * A logo já leva para a home, mas ela não se lê como "voltar para os
   * imóveis"; e sem este item a barra ficaria só com o WhatsApp solto.
   */
  if (mesmaPagina(rotaAtual, PRETENSAO)) {
    itens.push({ label: 'Ver imóveis', to: CATALOGO })
  } else {
    itens.push({ label: 'Quero alugar', to: PRETENSAO }, { label: 'Quero vender', to: PRETENSAO })
  }

  if (tenant?.whatsapp) {
    itens.push({ label: 'Falar no WhatsApp', to: whatsappHref, externo: true })
  }

  return itens
}
