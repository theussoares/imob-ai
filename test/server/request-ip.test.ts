import { describe, expect, test } from 'vitest'
import { clientIpFrom, rateLimitIpKey } from '~~/server/utils/request-ip'

/** Monta o getter de header a partir de um objeto simples. */
function headers(map: Record<string, string>) {
  return (name: string) => map[name.toLowerCase()]
}

describe('clientIpFrom', () => {
  // O deploy é Vercel (preset 'vercel'), sem Cloudflare na frente. Nada no
  // caminho da requisição escreve ou remove `cf-connecting-ip`, então ele chega
  // exatamente como o cliente mandou. Aceitá-lo é entregar o rate limit de
  // bandeja: basta mandar um valor diferente por requisição.
  test('ignora cf-connecting-ip, que o cliente controla', () => {
    const ip = clientIpFrom(headers({ 'cf-connecting-ip': '10.9.9.9', 'x-real-ip': '203.0.113.7' }))

    expect(ip).toBe('203.0.113.7')
  })

  test('ignora cf-connecting-ip mesmo quando é o único header presente', () => {
    expect(clientIpFrom(headers({ 'cf-connecting-ip': '10.9.9.9' }))).toBeNull()
  })

  test('prefere x-vercel-forwarded-for, que a plataforma define', () => {
    const ip = clientIpFrom(
      headers({ 'x-vercel-forwarded-for': '203.0.113.7', 'x-forwarded-for': '10.9.9.9' }),
    )

    expect(ip).toBe('203.0.113.7')
  })

  test('no x-forwarded-for usa a primeira entrada', () => {
    expect(clientIpFrom(headers({ 'x-forwarded-for': '203.0.113.7, 70.41.3.18' }))).toBe('203.0.113.7')
  })

  // Sem header de plataforma não há como identificar quem enviou. Devolver o IP
  // do socket colocaria TODO MUNDO no mesmo balde (em serverless o socket é o
  // proxy), e aí o 7º envio legítimo do tenant tomaria 429.
  test('devolve null quando não há header de plataforma', () => {
    expect(clientIpFrom(headers({}))).toBeNull()
    expect(clientIpFrom(headers({ 'x-real-ip': '   ' }))).toBeNull()
  })
})

describe('rateLimitIpKey', () => {
  test('IPv4 é usado como está', () => {
    expect(rateLimitIpKey('203.0.113.7')).toBe('203.0.113.7')
  })

  // O assinante recebe um /64 inteiro: trocar de endereço dentro dele é grátis
  // e ilimitado, sem precisar forjar header nenhum. Contar por endereço cheio
  // faz o limite por IP não valer nada em IPv6.
  test('IPv6 é agrupado pelo /64', () => {
    const a = rateLimitIpKey('2001:db8:abcd:1234:1111:2222:3333:4444')
    const b = rateLimitIpKey('2001:db8:abcd:1234:9999:8888:7777:6666')
    const outroBloco = rateLimitIpKey('2001:db8:abcd:9999:1111:2222:3333:4444')

    expect(a).toBe(b)
    expect(a).not.toBe(outroBloco)
  })

  test('formas diferentes do mesmo IPv6 dão a mesma chave', () => {
    expect(rateLimitIpKey('::1')).toBe(rateLimitIpKey('0:0:0:0:0:0:0:1'))
    expect(rateLimitIpKey('2001:DB8::1')).toBe(rateLimitIpKey('2001:db8:0:0:0:0:0:1'))
  })

  test('IPv6 abreviado no meio expande certo', () => {
    // 2001:db8::5 é 2001:db8:0:0:... — o /64 é 2001:db8:0:0.
    expect(rateLimitIpKey('2001:db8::5')).toBe(rateLimitIpKey('2001:db8:0:0:ffff:ffff:ffff:ffff'))
  })

  test('IPv4 mapeado em IPv6 volta a contar como IPv4', () => {
    expect(rateLimitIpKey('::ffff:203.0.113.7')).toBe('203.0.113.7')
  })
})
