import { describe, expect, test } from 'vitest'
import { canonicalHostFor } from '~~/server/utils/canonical-host'

describe('canonicalHostFor', () => {
  test('host diferente do primário devolve o primário', () => {
    expect(canonicalHostFor('tatiane.usemoradi.com.br', 'tpimobiliaria.com.br')).toBe(
      'tpimobiliaria.com.br',
    )
  })

  // A trava contra laço infinito: se o host já é o canônico, não redireciona.
  test('host que já é o primário não redireciona', () => {
    expect(canonicalHostFor('tpimobiliaria.com.br', 'tpimobiliaria.com.br')).toBeNull()
  })

  test('comparação ignora caixa', () => {
    expect(canonicalHostFor('TPImobiliaria.com.BR', 'tpimobiliaria.com.br')).toBeNull()
  })

  // Tenant sem domínio próprio (olmi antes desta mudança, demo sempre): fica
  // onde está. Sem isto, um tenant sem primário perderia o próprio endereço.
  test('sem domínio primário, não redireciona', () => {
    expect(canonicalHostFor('olmi.usemoradi.com.br', null)).toBeNull()
    expect(canonicalHostFor('olmi.usemoradi.com.br', '')).toBeNull()
  })

  // Em dev o host vem com porta; o guarda de ambiente já barra antes, mas a
  // comparação não pode quebrar se alguém chamar isto de outro lugar.
  test('porta no host não confunde a comparação', () => {
    expect(canonicalHostFor('tpimobiliaria.com.br:3000', 'tpimobiliaria.com.br')).toBeNull()
  })

  /**
   * A trava que impede derrubar o site.
   *
   * A Vercel está configurada para redirecionar o apex para o www. Se o banco
   * disser que o primário é o apex, o middleware manda www -> apex, a Vercel
   * manda apex -> www, e o site cai com "too many redirects". Aconteceria com
   * tatiane e olmi, as duas em produção.
   *
   * Consolidar apex e www é trabalho da hospedagem, que já faz. Aqui o trabalho
   * é outro: mandar o subdomínio ANTIGO da plataforma para o domínio próprio.
   * Então diferença só no "www." nunca vira redirect, e um `is_primary` errado
   * degrada para "não consolida" em vez de "site fora do ar".
   */
  test('diferença só no www não redireciona, em nenhuma direção', () => {
    expect(canonicalHostFor('www.tpimobiliaria.com.br', 'tpimobiliaria.com.br')).toBeNull()
    expect(canonicalHostFor('tpimobiliaria.com.br', 'www.tpimobiliaria.com.br')).toBeNull()
  })

  test('domínio de verdade diferente continua redirecionando', () => {
    expect(canonicalHostFor('tatiane.usemoradi.com.br', 'www.tpimobiliaria.com.br')).toBe(
      'www.tpimobiliaria.com.br',
    )
  })

  // "www.exemplo.com" e "exemplo.com.br" não são o mesmo domínio com prefixo:
  // a comparação tem que ser do que sobra depois de tirar o www, não um
  // `includes` frouxo.
  test('não confunde domínios que apenas se parecem', () => {
    expect(canonicalHostFor('www.exemplo.com', 'exemplo.com.br')).toBe('exemplo.com.br')
  })
})
