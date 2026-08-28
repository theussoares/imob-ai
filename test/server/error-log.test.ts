import { describe, expect, test } from 'vitest'
import { errorCode, errorReason, redactPayload, shouldLog } from '~~/server/utils/error-log'

describe('redactPayload — o log conta o que houve sem levar dado pessoal junto', () => {
  test('campo conhecido e útil vai com o valor', () => {
    const out = redactPayload({ code: 'VD-017', type: 'barracao', price: 350000 })

    expect(out).toMatchObject({ code: 'VD-017', type: 'barracao', price: 350000 })
  })

  test('nome e WhatsApp do proprietário viram presença, nunca o valor', () => {
    const out = redactPayload({ ownerName: 'Maria Souza', ownerPhone: '5567991234567' })

    expect(out).toEqual({ ownerName: 'preenchido', ownerPhone: 'preenchido' })
  })

  test('dados do lead (nome, telefone, e-mail, mensagem) não aparecem', () => {
    const out = redactPayload({
      name: 'João',
      phone: '5567999998888',
      email: 'joao@exemplo.com',
      message: 'Tenho interesse na casa',
      stage: 'novo',
    })

    expect(JSON.stringify(out)).not.toContain('João')
    expect(JSON.stringify(out)).not.toContain('99999')
    expect(JSON.stringify(out)).not.toContain('joao@exemplo.com')
    expect(JSON.stringify(out)).not.toContain('interesse')
    // O que não é de pessoa continua legível, senão o log não serve para nada.
    expect(out).toMatchObject({ stage: 'novo' })
  })

  test('CAMPO NOVO E DESCONHECIDO vira presença — a lista é de permissão, não de proibição', () => {
    // Este é o teste que segura a regra. Com uma lista de proibidos, o dia em
    // que alguém acrescentar `ownerEmail` ao formulário o campo passa direto
    // para o log, porque ninguém lembrou de proibi-lo. Aqui ele falha fechado.
    const out = redactPayload({ ownerEmail: 'maria@exemplo.com', cpfDoProprietario: '111.222.333-44' })

    expect(out).toEqual({ ownerEmail: 'preenchido', cpfDoProprietario: 'preenchido' })
  })

  test('campo vazio se distingue de campo preenchido', () => {
    const out = redactPayload({ ownerName: '', ownerPhone: null, images: [] })

    expect(out).toEqual({ ownerName: 'vazio', ownerPhone: 'vazio', images: 'vazio' })
  })

  test('valor longo demais é cortado — log é linha, não documento', () => {
    const out = redactPayload({ title: 'a'.repeat(500) })

    expect(String(out!.title).length).toBeLessThan(140)
    expect(String(out!.title)).toMatch(/…$/)
  })

  test('objeto aninhado em campo liberado não escapa inteiro', () => {
    // `code` está liberado esperando string. Se vier um objeto, deixar passar
    // publicaria o que estiver dentro dele sem nenhuma checagem.
    const out = redactPayload({ code: { nome: 'Maria', telefone: '5567991234567' } })

    expect(out).toEqual({ code: 'preenchido' })
  })

  test('corpo que não é objeto não vira log nenhum', () => {
    expect(redactPayload(undefined)).toBeUndefined()
    expect(redactPayload('texto solto')).toBeUndefined()
    expect(redactPayload(null)).toBeUndefined()
  })
})

describe('shouldLog — 4xx esperado é o sistema funcionando', () => {
  test('erro de servidor entra', () => {
    expect(shouldLog(500, false)).toBe(true)
  })

  test('recusa de validação e de sessão ficam de fora', () => {
    // Logar todo 4xx faz volume, e log que ninguém lê não avisa nada.
    expect(shouldLog(422, false)).toBe(false)
    expect(shouldLog(401, false)).toBe(false)
    expect(shouldLog(409, false)).toBe(false)
    expect(shouldLog(404, false)).toBe(false)
  })

  test('o que o Nitro marcou como inesperado entra mesmo com status baixo', () => {
    expect(shouldLog(400, true)).toBe(true)
  })
})

describe('errorCode / errorReason — o motivo, sem arrastar o objeto inteiro', () => {
  test('pega o code do Postgres que o Nitro embrulha em cause', () => {
    // Formato real do erro que chegou da produção em 28/08.
    const e = Object.assign(new Error('duplicate key value violates unique constraint'), {
      statusCode: 500,
      cause: { code: '23505', message: 'duplicate key value violates unique constraint' },
    })

    expect(errorCode(e)).toBe('23505')
    expect(errorReason(e)).toContain('duplicate key')
  })

  test('pega o code quando ele vem direto no erro', () => {
    expect(errorCode(Object.assign(new Error('x'), { code: '22P02' }))).toBe('22P02')
  })

  test('erro sem code não inventa um', () => {
    expect(errorCode(new Error('qualquer'))).toBeUndefined()
  })

  test('usa a mensagem do cause quando o erro de fora vem sem mensagem', () => {
    const e = Object.assign(new Error(''), { cause: { message: 'connection terminated' } })

    expect(errorReason(e)).toBe('connection terminated')
  })

  test('o details do Postgres nunca entra — ele ecoa os valores da linha', () => {
    const e = Object.assign(new Error('duplicate key'), {
      cause: {
        code: '23505',
        details: 'Key (tenant_id, owner_phone)=(abc, 5567991234567) already exists.',
      },
    })

    expect(errorReason(e)).not.toContain('5567991234567')
  })
})
