import { describe, expect, test } from 'vitest'
import { itensDoMenu } from '~~/shared/utils/header-menu'

/**
 * Quais destinos aparecem no header, e quando.
 *
 * ⚠️ A regra que este arquivo existe para proteger: **só a Área do Cliente
 * depende do plano.** "Quero alugar" e "Quero vender" servem a qualquer
 * imobiliária — condicionar o menu inteiro ao entitlement faria esses dois
 * destinos existirem apenas para quem contratou o portal, que é o item errado a
 * amarrar.
 *
 * E o lado oposto já quebrou de verdade: até o PR #27, "Contratos" e "Clientes"
 * apareciam no painel de TODA imobiliária porque não havia condição nenhuma.
 * Um link de portal no site de quem não tem portal leva o visitante a um login
 * onde ninguém tem conta — e some sem erro, porque o link continua renderizando.
 */

const WA = 'https://wa.me/5567999999999'

/** Tenant mínimo, só com o que o menu lê. */
function tenant(over: Record<string, unknown> = {}) {
  return { portalEnabled: false, whatsapp: null, ...over } as Parameters<typeof itensDoMenu>[0]
}

describe('itensDoMenu', () => {
  test('sem portal e sem whatsapp, sobram as duas pretensões', () => {
    const itens = itensDoMenu(tenant(), WA)
    expect(itens.map((i) => i.label)).toEqual(['Quero alugar', 'Quero vender'])
  })

  test('a Área do Cliente entra só quando o recurso está ligado', () => {
    expect(itensDoMenu(tenant(), WA).some((i) => i.label === 'Área do Cliente')).toBe(false)
    expect(
      itensDoMenu(tenant({ portalEnabled: true }), WA).some((i) => i.label === 'Área do Cliente'),
    ).toBe(true)
  })

  test('o WhatsApp entra só quando a imobiliária tem número', () => {
    expect(itensDoMenu(tenant(), WA).some((i) => i.externo)).toBe(false)
    const com = itensDoMenu(tenant({ whatsapp: '5567999999999' }), WA)
    expect(com.some((i) => i.externo && i.to === WA)).toBe(true)
  })

  test('a ordem é a canônica, não a ordem das condições', () => {
    // A mesma lista precisa sair na mesma ordem sempre: menu que reordena
    // entre páginas faz a pessoa procurar o item duas vezes.
    const itens = itensDoMenu(tenant({ portalEnabled: true, whatsapp: '5567999999999' }), WA)
    expect(itens.map((i) => i.label)).toEqual([
      'Área do Cliente',
      'Quero alugar',
      'Quero vender',
      'Falar no WhatsApp',
    ])
  })

  test('os dois rótulos de pretensão apontam para a MESMA página', () => {
    // Não existe `/quero-alugar`: é uma página só, com dois rótulos. Quem quer
    // alugar o próprio imóvel procura a palavra "alugar" e não se reconhece em
    // "quero vender" — dois rótulos custam menos que uma segunda página para
    // manter. O rodapé resolve o mesmo problema com o rótulo combinado
    // "Quero vender ou alugar".
    const itens = itensDoMenu(tenant(), WA)
    const destinos = itens.filter((i) => !i.externo).map((i) => i.to)
    expect(destinos).toEqual(['/quero-vender', '/quero-vender'])
  })

  test('só o WhatsApp é externo — o resto é navegação interna', () => {
    // O `externo` decide `<a target="_blank">` contra `<NuxtLink>`. Marcar um
    // link interno como externo o tiraria da navegação que o rastreador segue.
    const itens = itensDoMenu(tenant({ portalEnabled: true, whatsapp: '5567999999999' }), WA)
    expect(itens.filter((i) => i.externo).map((i) => i.label)).toEqual(['Falar no WhatsApp'])
  })

  test('tenant ausente não quebra o header', () => {
    // O header renderiza no SSR antes de o tenant resolver em alguns caminhos
    // (host desconhecido, landing da plataforma). Melhor um menu curto que uma
    // exceção na página inteira.
    expect(() => itensDoMenu(null, WA)).not.toThrow()
    expect(itensDoMenu(null, WA).map((i) => i.label)).toEqual(['Quero alugar', 'Quero vender'])
  })
})
