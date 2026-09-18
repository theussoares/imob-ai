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

describe('o menu não linka para a página em que você está', () => {
  /**
   * ⚠️ Em `/quero-vender` o menu tinha TRÊS itens e DOIS eram links para a
   * própria página — "Quero alugar" e "Quero vender" apontam para o mesmo
   * destino. No celular isso é pior: a pessoa abre o burger e dois terços do
   * que aparece não leva a lugar nenhum.
   *
   * O padrão usual seria marcar o item atual com `aria-current`, não removê-lo.
   * Ele não serve aqui **por causa dos dois rótulos para uma página só**:
   * marcar "o atual" acenderia os dois ao mesmo tempo, e duas coisas destacadas
   * juntas lê como defeito, não como orientação.
   *
   * Isto NÃO é o menu reordenando entre páginas — o que o teste da ordem
   * canônica acima proíbe. O item de volta ocupa exatamente a posição das
   * pretensões que saíram, então nada muda de lugar.
   */
  const CHEIO = { portalEnabled: true, whatsapp: '5567999999999' }

  test('fora da página de pretensão, nada muda', () => {
    expect(itensDoMenu(tenant(CHEIO), WA, '/').map((i) => i.label)).toEqual([
      'Área do Cliente',
      'Quero alugar',
      'Quero vender',
      'Falar no WhatsApp',
    ])
  })

  test('na própria página de pretensão, os dois rótulos saem', () => {
    const labels = itensDoMenu(tenant(CHEIO), WA, '/quero-vender').map((i) => i.label)
    expect(labels).not.toContain('Quero alugar')
    expect(labels).not.toContain('Quero vender')
  })

  test('entra a volta para o catálogo, no lugar que eles ocupavam', () => {
    // A posição importa: o item de volta herda a vaga das pretensões, entre a
    // Área do Cliente e o WhatsApp. Jogá-lo no começo ou no fim faria os
    // vizinhos trocarem de lugar ao navegar.
    const itens = itensDoMenu(tenant(CHEIO), WA, '/quero-vender')
    expect(itens.map((i) => i.label)).toEqual([
      'Área do Cliente',
      'Ver imóveis',
      'Falar no WhatsApp',
    ])
    expect(itens.find((i) => i.label === 'Ver imóveis')?.to).toBe('/')
  })

  test('NENHUM item aponta para a rota atual', () => {
    // A regra geral, não o caso particular. Um destino novo que casasse com a
    // página atual voltaria a produzir link morto sem ninguém perceber.
    for (const rota of ['/', '/quero-vender']) {
      const itens = itensDoMenu(tenant(CHEIO), WA, rota)
      expect(itens.filter((i) => !i.externo).map((i) => i.to)).not.toContain(rota)
    }
  })

  test('a barra no fim não engana', () => {
    // `/quero-vender/` é a mesma página. Comparar cru deixaria os links mortos
    // de volta só porque a URL veio com barra.
    const labels = itensDoMenu(tenant(CHEIO), WA, '/quero-vender/').map((i) => i.label)
    expect(labels).toContain('Ver imóveis')
  })

  test('sem rota, o menu é o completo', () => {
    // O header renderiza em contextos onde a rota pode não ter resolvido. Melhor
    // um link morto eventual que um menu sem as pretensões em toda página.
    expect(itensDoMenu(tenant(CHEIO), WA).map((i) => i.label)).toContain('Quero vender')
  })
})
