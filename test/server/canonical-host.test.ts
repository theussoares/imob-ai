import { describe, expect, test } from 'vitest'
import { canonicalHostFor } from '~~/server/utils/canonical-host'

describe('canonicalHostFor', () => {
  test('host diferente do primário devolve o primário', () => {
    expect(canonicalHostFor('tatiane.usemoradi.com.br', 'tpimobiliaria.com.br')).toBe(
      'tpimobiliaria.com.br',
    )
  })

  // www e apex são o mesmo site: consolidar os dois é parte do ponto.
  test('www redireciona para o apex quando o apex é o primário', () => {
    expect(canonicalHostFor('www.tpimobiliaria.com.br', 'tpimobiliaria.com.br')).toBe(
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
})
