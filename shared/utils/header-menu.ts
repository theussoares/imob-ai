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
): ItemDoMenu[] {
  const itens: ItemDoMenu[] = []

  if (tenant?.portalEnabled) {
    itens.push({ label: 'Área do Cliente', to: '/area-cliente' })
  }

  itens.push({ label: 'Quero alugar', to: PRETENSAO }, { label: 'Quero vender', to: PRETENSAO })

  if (tenant?.whatsapp) {
    itens.push({ label: 'Falar no WhatsApp', to: whatsappHref, externo: true })
  }

  return itens
}
