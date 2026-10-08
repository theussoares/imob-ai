import { afterEach, describe, expect, test, vi } from 'vitest'
import { X509Certificate } from 'node:crypto'
import {
  criarCora,
  emitidaDaCora,
  eventoDaFatura,
  situacaoDaFatura,
  webhookDaCora,
} from '~~/server/services/payments/cora'
import { lerEventoDaCora } from '~~/server/services/payments/webhooks'
import type { RespostaDaCora, TransporteCora } from '~~/server/services/payments/cora-transporte'
import { ErroDoProvedor } from '~~/server/services/payments/provider'
import { validarCertificado } from '~~/server/utils/certificado'
import { assertPaymentAccountInput } from '~~/server/utils/validate'
import { CERT_A, CERT_B, KEY_A, KEY_B } from '../fixtures/certificados'

/**
 * O adaptador da Cora. O que a Cora NÃO tem (cadastro de cliente, "recebido
 * em dinheiro", assinatura de webhook) é coberto aqui, e cada cobertura é uma
 * ameaça de dinheiro:
 *   - baixa manual deixando o boleto pagável (o inquilino paga duas vezes);
 *   - webhook forjado baixando boleto que ninguém pagou;
 *   - retry criando um segundo boleto;
 *   - valor em centavos virando reais errado.
 */

vi.stubGlobal('createError', (o: unknown) => Object.assign(new Error((o as { statusMessage: string }).statusMessage), o))
afterEach(() => vi.useRealTimers())

type Chamada = { metodo: string; caminho: string; corpo?: unknown; cabecalhos?: Record<string, string> }

function transporte(responder: (c: Chamada) => RespostaDaCora) {
  const chamadas: Chamada[] = []
  const t: TransporteCora = {
    token: async () => 'tok',
    chamar: async (metodo, caminho, corpo, cabecalhos) => {
      const c = { metodo, caminho, corpo, cabecalhos }
      chamadas.push(c)
      return responder(c)
    },
  }
  return { t, chamadas }
}

const ok = (json: unknown = {}, status = 200): RespostaDaCora => ({ status, json: json as Record<string, unknown> })

const pagador = { nome: 'Maria Souza', documento: '12345678901', email: 'maria@x.com', telefone: null, referencia: 'pu1' }
const cobranca = {
  clienteExterno: 'inline:pu1',
  pagador,
  valor: 2400.5,
  vencimento: '2099-10-10',
  descricao: 'Aluguel 09/2026',
  referencia: 'charge-1',
  multaPercent: 2,
  jurosMensalPercent: 1,
}

describe('emitir', () => {
  test('valor em centavos, pagador inline, multa e juros do contrato, boleto + Pix', async () => {
    const { t, chamadas } = transporte(() =>
      ok({ id: 'inv_1', status: 'OPEN', payment_options: { bank_slip: { url: 'https://pdf', digitable: '123' } }, pix: { emv: '000201' } }),
    )
    const r = await criarCora({ ambiente: 'sandbox', transporte: t }).emitir(cobranca)

    expect(r).toEqual({ externalId: 'inv_1', paymentUrl: null, bankSlipUrl: 'https://pdf', digitableLine: '123', pixCopyPaste: '000201' })
    const c = chamadas[0]!
    expect(c.caminho).toBe('/v2/invoices/')
    expect(c.corpo).toMatchObject({
      code: 'charge-1',
      customer: { name: 'Maria Souza', email: 'maria@x.com', document: { identity: '12345678901', type: 'CPF' } },
      services: [{ amount: 240050 }],
      payment_terms: { due_date: '2099-10-10', fine: { rate: 2 }, interest: { rate: 1 } },
      payment_forms: ['BANK_SLIP', 'PIX'],
    })
  })

  test('CNPJ é reconhecido pelo tamanho; sem multa/juros no contrato, o boleto sai sem eles', async () => {
    const { t, chamadas } = transporte(() => ok({ id: 'inv_2' }))
    await criarCora({ ambiente: 'sandbox', transporte: t }).emitir({
      ...cobranca,
      pagador: { ...pagador, documento: '12345678000199' },
      multaPercent: null,
      jurosMensalPercent: null,
    })
    const corpo = chamadas[0]!.corpo as { customer: { document: { type: string } }; payment_terms: Record<string, unknown> }
    expect(corpo.customer.document.type).toBe('CNPJ')
    expect(corpo.payment_terms).toEqual({ due_date: '2099-10-10' })
  })

  test('o retry da MESMA cobrança reusa a Idempotency-Key; outra cobrança, outra chave', async () => {
    const { t, chamadas } = transporte(() => ok({ id: 'inv_1' }))
    const cora = criarCora({ ambiente: 'sandbox', transporte: t })
    await cora.emitir(cobranca)
    await cora.emitir(cobranca)
    await cora.emitir({ ...cobranca, referencia: 'charge-2' })
    const [a, b, c] = chamadas.map((x) => x.cabecalhos!['Idempotency-Key'])
    expect(a).toBe(b)
    expect(a).not.toBe(c)
  })

  test('sem e-mail do inquilino a Cora recusa: dizemos antes, em português, sem chamar a API', async () => {
    const { t, chamadas } = transporte(() => ok({ id: 'x' }))
    await expect(
      criarCora({ ambiente: 'sandbox', transporte: t }).emitir({ ...cobranca, pagador: { ...pagador, email: null } }),
    ).rejects.toThrow(/e-mail/)
    expect(chamadas).toHaveLength(0)
  })

  test('resposta sem id não vira "emitido"', () => {
    expect(() => emitidaDaCora({})).toThrow(ErroDoProvedor)
  })
})

describe('cancelar ≠ baixar', () => {
  test('cancelar é só o DELETE; 204 sem corpo é sucesso', async () => {
    const { t, chamadas } = transporte(() => ({ status: 204, json: null }))
    await criarCora({ ambiente: 'sandbox', transporte: t }).cancelar('inv_1')
    expect(chamadas).toEqual([{ metodo: 'DELETE', caminho: '/v2/invoices/inv_1', corpo: undefined, cabecalhos: undefined }])
  })

  test('baixarPorFora cancela o boleto lá: sem isso o inquilino pagaria depois da baixa', async () => {
    const { t, chamadas } = transporte(() => ({ status: 204, json: null }))
    await criarCora({ ambiente: 'sandbox', transporte: t }).baixarPorFora('inv_1', 2400, '2026-10-05')
    expect(chamadas.map((c) => `${c.metodo} ${c.caminho}`)).toEqual(['DELETE /v2/invoices/inv_1'])
  })

  test('REC-0006 (já pago lá): erro em português que manda sincronizar — nunca baixa por cima', async () => {
    const { t } = transporte(() => ok({ code: 'REC-0006', message: 'paid' }, 422))
    await expect(criarCora({ ambiente: 'sandbox', transporte: t }).baixarPorFora('inv_1', 1, '2026-10-05')).rejects.toThrow(/já foi pago/)
  })
})

describe('erros da Cora', () => {
  test('400 com errors[]: diz QUAL campo falhou', async () => {
    const { t } = transporte(() =>
      ok({ code: 'invalid_request', message: 'Request has invalid parameters', errors: [{ id: 'customer.document.identity', message: 'must not be empty' }] }, 400),
    )
    await expect(criarCora({ ambiente: 'sandbox', transporte: t }).emitir(cobranca)).rejects.toThrow(/customer\.document\.identity: must not be empty/)
  })

  test('sem corpo legível, cai no status', async () => {
    const { t } = transporte(() => ({ status: 503, json: null }))
    await expect(criarCora({ ambiente: 'sandbox', transporte: t }).emitir(cobranca)).rejects.toThrow(/503/)
  })
})

describe('consultar → evento e situação', () => {
  const paga = { id: 'inv_1', status: 'PAID', total_amount: 240050, total_paid: 240500, occurrence_date: '2026-10-05', payments: [{ method: 'PIX' }] }

  test('PAID: o que ENTROU (total_paid, com juros) e o método', () => {
    expect(eventoDaFatura(paga)).toMatchObject({ tipo: 'pago', externalId: 'inv_1', valor: 2405, data: '2026-10-05', metodo: 'pix', emDinheiro: false })
  })

  test('em aberto e vencida não têm evento a aplicar; cancelada vira "cancelado"', () => {
    expect(eventoDaFatura({ id: 'i', status: 'OPEN' })).toBeNull()
    expect(eventoDaFatura({ id: 'i', status: 'LATE' })).toBeNull()
    expect(eventoDaFatura({ id: 'i', status: 'CANCELLED' })).toMatchObject({ tipo: 'cancelado' })
  })

  test('o eventId sintético da consulta não colide com o do webhook real', () => {
    expect(eventoDaFatura(paga)!.eventId).toBe('consulta:inv_1:PAID')
    expect(eventoDaFatura(paga, 'evt_real')!.eventId).toBe('evt_real')
  })

  test('situação traduzida, sem status da Cora vazando', () => {
    expect(situacaoDaFatura(paga).status).toBe('paga')
    expect(situacaoDaFatura({ status: 'LATE' }).status).toBe('vencida')
    expect(situacaoDaFatura({ status: 'IN_PAYMENT' }).status).toBe('em_aberto')
    expect(situacaoDaFatura({ status: 'CANCELLED' }).status).toBe('removida')
    expect(situacaoDaFatura({ status: 'NOVO' }).status).toBe('outra')
    expect(situacaoDaFatura({ status: 'OPEN', total_amount: 240050, payment_terms: { due_date: '2026-10-10' } })).toMatchObject({
      valor: 2400.5,
      vencimento: '2026-10-10',
    })
  })
})

describe('webhook da Cora (sem corpo, sem assinatura)', () => {
  const cab = (m: Record<string, string>) => (n: string) => m[n]

  test('lê só os cabeçalhos; qualquer coisa que não seja fatura é ignorada', () => {
    expect(webhookDaCora(cab({ 'webhook-event-id': 'evt_1', 'webhook-event-type': 'invoice.paid', 'webhook-resource-id': 'inv_1' }))).toEqual({
      eventId: 'evt_1',
      bruto: 'invoice.paid',
      resourceId: 'inv_1',
    })
    expect(webhookDaCora(cab({ 'webhook-event-id': 'e', 'webhook-event-type': 'transfer.completed', 'webhook-resource-id': 'tra_1' }))).toBeNull()
    expect(webhookDaCora(cab({ 'webhook-event-id': 'e', 'webhook-event-type': 'invoice.paid' }))).toBeNull()
    expect(webhookDaCora(cab({}))).toBeNull()
  })

  test('webhook FORJADO: o evento vem da reconsulta, então "invoice.paid" sobre boleto em aberto não baixa nada', async () => {
    const { t, chamadas } = transporte(() => ok({ id: 'inv_1', status: 'OPEN' }))
    const evento = await lerEventoDaCora(
      { cabecalho: cab({ 'webhook-event-id': 'evt_1', 'webhook-event-type': 'invoice.paid', 'webhook-resource-id': 'inv_1' }), corpo: async () => ({ forjado: true }) },
      criarCora({ ambiente: 'sandbox', transporte: t }),
    )
    expect(evento).toBeNull()
    expect(chamadas.map((c) => `${c.metodo} ${c.caminho}`)).toEqual(['GET /v2/invoices/inv_1'])
  })

  test('boleto pago de verdade: evento com o id REAL do webhook (o reenvio vira no-op no diário)', async () => {
    const { t } = transporte(() => ok({ id: 'inv_1', status: 'PAID', total_paid: 100000, occurrence_date: '2026-10-05' }))
    const evento = await lerEventoDaCora(
      { cabecalho: cab({ 'webhook-event-id': 'evt_9', 'webhook-event-type': 'invoice.paid', 'webhook-resource-id': 'inv_1' }), corpo: async () => null },
      criarCora({ ambiente: 'sandbox', transporte: t }),
    )
    expect(evento).toMatchObject({ eventId: 'evt_9', bruto: 'invoice.paid', tipo: 'pago', valor: 1000, externalId: 'inv_1' })
  })
})

describe('webhook registrado', () => {
  test('três gatilhos de fatura, cada um com a sua Idempotency-Key; id externo guarda os três', async () => {
    let n = 0
    const { t, chamadas } = transporte(() => ok({ id: `ep_${++n}` }))
    const r = await criarCora({ ambiente: 'sandbox', transporte: t }).registrarWebhook('https://x/api/webhooks/cora/u', '', null)
    expect(r.externalId).toBe('ep_1,ep_2,ep_3')
    expect(chamadas.map((c) => (c.corpo as { trigger: string }).trigger)).toEqual(['paid', 'canceled', 'overdue'])
    expect(new Set(chamadas.map((c) => c.cabecalhos!['Idempotency-Key'])).size).toBe(3)
  })

  test('falha no meio desfaz o que já foi registrado (sem webhook órfão)', async () => {
    let n = 0
    const { t, chamadas } = transporte((c) => {
      if (c.metodo === 'DELETE') return { status: 204, json: null }
      return ++n === 3 ? ok({ message: 'x' }, 500) : ok({ id: `ep_${n}` })
    })
    await expect(criarCora({ ambiente: 'sandbox', transporte: t }).registrarWebhook('https://x/u', '', null)).rejects.toBeInstanceOf(ErroDoProvedor)
    expect(chamadas.filter((c) => c.metodo === 'DELETE').map((c) => c.caminho)).toEqual(['/endpoints/ep_1', '/endpoints/ep_2'])
  })

  test('remover tolera 404 (já não existe) e remove cada um', async () => {
    const { t, chamadas } = transporte((c) => (c.caminho.endsWith('ep_2') ? ok({}, 404) : { status: 204, json: null }))
    await criarCora({ ambiente: 'sandbox', transporte: t }).removerWebhook('ep_1,ep_2,ep_3')
    expect(chamadas).toHaveLength(3)
  })
})

describe('simular pagamento', () => {
  test('só no sandbox', async () => {
    const { t } = transporte(() => ok({}))
    await expect(criarCora({ ambiente: 'producao', transporte: t }).simularPagamento('inv_1', 1)).rejects.toThrow(/sandbox/)
  })

  test('REC-0007: a Cora não deixa pagar o próprio boleto em stage — mensagem que diz o que fazer', async () => {
    const { t } = transporte(() => ok({ code: 'REC-0007', message: 'x' }, 422))
    await expect(criarCora({ ambiente: 'sandbox', transporte: t }).simularPagamento('inv_1', 1)).rejects.toThrow(/outra conta de teste/)
  })
})

describe('certificado enviado pela imobiliária', () => {
  test('par válido: devolve a validade lida do X.509', () => {
    const { validoAte } = validarCertificado(CERT_A, KEY_A)
    expect(validoAte.getTime()).toBe(new Date(new X509Certificate(CERT_A).validTo).getTime())
  })

  test('chave de OUTRO certificado: recusa antes de qualquer chamada à Cora', () => {
    expect(() => validarCertificado(CERT_A, KEY_B)).toThrow(/não corresponde/)
    expect(() => validarCertificado(CERT_B, KEY_A)).toThrow(/não corresponde/)
  })

  test('lixo no lugar do PEM: uma frase por arquivo, sem erro de handshake', () => {
    expect(() => validarCertificado('lixo', KEY_A)).toThrow(/certificado não é um PEM/)
    expect(() => validarCertificado(CERT_A, 'lixo')).toThrow(/chave privada não é um PEM/)
  })

  test('certificado vencido é recusado', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2200-01-01'))
    expect(() => validarCertificado(CERT_A, KEY_A)).toThrow(/venceu/)
  })
})

describe('validação da conta Cora', () => {
  const ok2 = { provider: 'cora', environment: 'sandbox', clientId: 'int-abcdefgh', certificatePem: CERT_A, privateKeyPem: KEY_A }
  test('aceita o conjunto completo', () => {
    expect(() => assertPaymentAccountInput(ok2)).not.toThrow()
  })
  test.each([
    ['sem client_id', { clientId: '' }],
    ['client_id com espaço', { clientId: 'int abc defg' }],
    ['certificado que não é PEM', { certificatePem: 'x' }],
    ['chave que não é PEM', { privateKeyPem: 'x' }],
    ['certificado gigante', { certificatePem: `-----BEGIN CERTIFICATE-----${'a'.repeat(30_000)}` }],
  ])('recusa %s', (_n, over) => {
    expect(() => assertPaymentAccountInput({ ...ok2, ...over })).toThrow()
  })
})
