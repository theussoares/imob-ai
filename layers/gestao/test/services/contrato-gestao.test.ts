import { describe, expect, it } from 'vitest'
import { criarClienteGestao } from '../../app/services/clienteGestao'
import type { GestaoRepository } from '../../app/services/GestaoRepository'
import { HttpGestaoRepository, type Subir } from '../../app/services/HttpGestaoRepository'
import { MockGestaoRepository } from '../../app/services/MockGestaoRepository'
import { armazemEmMemoria, criarServidorFalso, MSG_409 } from '../helpers/servidor-falso'

/**
 * Contrato do `GestaoRepository`: a MESMA suíte roda contra o mock (domínio sobre localStorage) e
 * contra o http (cliente + `$fetch` falso). Se um passar e o outro não, trocar
 * `NUXT_PUBLIC_GESTAO_BACKEND` mudaria o comportamento da tela — que é o que este teste impede.
 */

const pdf = () => new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'RG.pdf', { type: 'application/pdf' })
const arquivo = () => {
  const file = pdf()
  return { name: file.name, size: file.size, file }
}

interface Fabrica {
  nome: string
  criar(): { repo: GestaoRepository }
}

function montarHttp(servidor = criarServidorFalso()): GestaoRepository {
  const versoes = new Map<string, number>()
  const api = criarClienteGestao({ fetcher: servidor.fetcher, token: () => 'tok' })
  const subir: Subir = async (url) => void servidor.subidas.push(url)
  return new HttpGestaoRepository(api, { ler: (k) => versoes.get(k), gravar: (k, v) => void versoes.set(k, v) }, () => 'dono', subir)
}

const fabricas: Fabrica[] = [
  {
    nome: 'mock',
    criar: () => ({ repo: new MockGestaoRepository(armazemEmMemoria(), () => ({ nome: 'Helena' }), async () => { throw new Error('sem semente') }, () => '17/11/2026 10:00') }),
  },
  { nome: 'http', criar: () => ({ repo: montarHttp() }) },
]

describe.each(fabricas)('GestaoRepository — $nome', ({ criar }) => {
  it('carrega vendas, locações, matriz e corretores', async () => {
    const { repo } = criar()
    const d = await repo.carregar()
    expect(d.processos.length).toBeGreaterThan(0)
    expect(d.locacoes.length).toBeGreaterThan(0)
    expect(d.corretores.length).toBeGreaterThan(0)
    expect(d.matriz.valores.dono).toBe('sim')
    expect(d.processos.every((p) => Array.isArray(p.adiantamentos) && p.fin)).toBe(true)
  })

  it('abre uma venda e a ação de status chega ao agregado', async () => {
    const { repo } = criar()
    const dados = await repo.carregar()
    const aberta = await repo.abrirVenda({ imovel: 'Casa 12', vendedor: 'Ana', comprador: 'Beto', corretorId: dados.corretores[0]!.id })
    expect(aberta.ok).toBe(true)
    const id = aberta.ok ? aberta.processo!.id : ''
    expect(id).toMatch(/^V-\d{4}-\d{4}$/)
    const r = await repo.executar('venda', id, 'mudarStatus', { status: 'Proposta realizada' })
    expect(r.ok && r.processo!.status).toBe('Proposta realizada')
    // O histórico registra a ação; o ator é de quem executa (servidor/sessão), nunca do corpo.
    expect(r.ok && r.processo!.hist[0]!.acao).toMatch(/status/i)
  })

  it('devolve a frase do domínio quando a regra recusa (422)', async () => {
    const { repo } = criar()
    const dados = await repo.carregar()
    const id = dados.processos[0]!.id
    const r = await repo.executar('venda', id, 'salvarObservacao', { obs: 'x'.repeat(2500) })
    expect(r.ok).toBe(false)
    expect(!r.ok && r.erro).toMatch(/2000|caracteres/i)
    expect(!r.ok && r.conflito).toBeFalsy()
  })

  it('abre locação e roda ações pelo nome', async () => {
    const { repo } = criar()
    const dados = await repo.carregar()
    const aberta = await repo.abrirLocacao({ locador: 'Lia', locatario: 'Caio', imovelId: 'im-101', imovel: 'Apto 3', corretorId: dados.corretores[0]!.id })
    expect(aberta.ok).toBe(true)
    const id = aberta.ok ? aberta.locacao!.id : ''
    const g = await repo.executar('locacao', id, 'salvarGarantia', { tipo: 'Caução', detalhe: '3 meses' })
    expect(g.ok && g.locacao!.garantia?.tipo).toBe('Caução')
    const de_novo = await repo.executar('locacao', id, 'salvarGarantia', { tipo: 'Fiador', detalhe: 'Maria' })
    expect(de_novo.ok && de_novo.locacao!.garantia?.tipo).toBe('Fiador')
  })

  it('documento: envia, confere, apaga, restaura e baixa', async () => {
    const { repo } = criar()
    const dados = await repo.carregar()
    const alvo = { tipo: 'venda' as const, id: dados.processos[0]!.id }
    const env = await repo.enviarDocumento(alvo, arquivo(), { categoria: 'pessoas' })
    expect(env.ok).toBe(true)
    const doc = env.ok ? env.documento! : null
    expect(doc?.nome).toBe('RG.pdf')
    expect((await repo.documentosDoAlvo(alvo.tipo, alvo.id)).some((d) => d.id === doc!.id)).toBe(true)

    const conf = await repo.conferirDocumento(doc!)
    expect(conf.ok && conf.documento!.estado).toBe('conferido')
    const apag = await repo.apagarDocumento(doc!)
    expect(apag.ok && apag.documento!.apagado).toBeTruthy()
    expect((await repo.lixeira()).some((d) => d.id === doc!.id)).toBe(true)
    expect((await repo.documentosDoAlvo(alvo.tipo, alvo.id)).some((d) => d.id === doc!.id)).toBe(false)
    const rest = await repo.restaurarDocumento(doc!)
    expect(rest.ok && rest.documento!.apagado).toBeNull()

    const baixar = await repo.baixarDocumento(doc!)
    expect(baixar.ok).toBe(true)
  })

  it('nova versão de documento sobe o número de versões', async () => {
    const { repo } = criar()
    const dados = await repo.carregar()
    const alvo = { tipo: 'venda' as const, id: dados.processos[0]!.id }
    const env = await repo.enviarDocumento(alvo, arquivo(), { categoria: 'pessoas' })
    const doc = env.ok ? env.documento! : null
    const v2 = await repo.novaVersaoDocumento(doc!, alvo.tipo, arquivo())
    expect(v2.ok && v2.documento!.versoes).toBe(doc!.versoes + 1)
  })

  it('salva matriz e configurações e faz a consulta cadastral (simulada, documento mascarado)', async () => {
    const { repo } = criar()
    const dados = await repo.carregar()
    const m = { ...dados.matriz, financeiro: dados.matriz.financeiro }
    expect((await repo.salvarMatriz(m)).ok).toBe(true)
    const c = await repo.salvarConfig({ ...dados.config, comissaoPct: 4 })
    expect(c.ok && c.config.comissaoPct).toBe(4)
    const q = await repo.consultar({ documento: '529.982.247-25', finalidade: 'Locação' })
    expect(q.ok && q.consulta.documentoMascarado).not.toContain('529.982.247')
    const ruim = await repo.consultar({ documento: '123', finalidade: 'Locação' })
    expect(ruim.ok).toBe(false)
  })
})

describe('GestaoRepository — http: erros e concorrência', () => {
  it('409 de versão vira conflito com a frase «alterado por outra pessoa»', async () => {
    const servidor = criarServidorFalso()
    const aba1 = montarHttp(servidor)
    const aba2 = montarHttp(servidor)
    const d1 = await aba1.carregar()
    await aba2.carregar()
    const id = d1.locacoes[0]!.id
    // A aba 1 grava; a aba 2 ainda tem a versão antiga.
    expect((await aba1.executar('locacao', id, 'salvarGarantia', { tipo: 'Caução', detalhe: 'a' })).ok).toBe(true)
    const r = await aba2.executar('locacao', id, 'salvarGarantia', { tipo: 'Fiador', detalhe: 'b' })
    expect(r).toMatchObject({ ok: false, conflito: true, erro: MSG_409 })
    // Recarregar traz a versão nova e a tentativa seguinte vale.
    expect((await aba2.recarregar('locacao', id)).ok).toBe(true)
    expect((await aba2.executar('locacao', id, 'salvarGarantia', { tipo: 'Fiador', detalhe: 'b' })).ok).toBe(true)
  })

  it('manda Authorization: Bearer em toda chamada autenticada', async () => {
    const servidor = criarServidorFalso()
    const repo = montarHttp(servidor)
    await repo.carregar()
    expect(servidor.chamadas.length).toBeGreaterThan(3)
    expect(servidor.chamadas.every((c) => c.auth === 'Bearer tok')).toBe(true)
  })

  it('token recusado (401) vira sessaoExpirada e avisa quem escuta', async () => {
    const servidor = criarServidorFalso({ tokenValido: 'outro' })
    let avisos = 0
    const api = criarClienteGestao({ fetcher: servidor.fetcher, token: () => 'tok', aoSessaoExpirada: () => void avisos++ })
    const repo = new HttpGestaoRepository(api, { ler: () => undefined, gravar: () => {} }, () => 'dono')
    await expect(repo.carregar()).rejects.toMatchObject({ status: 401 })
    expect(avisos).toBeGreaterThan(0)
    const r = await repo.executar('venda', 'V-2026-0001', 'mudarStatus', { status: 'Proposta realizada' })
    expect(r).toMatchObject({ ok: false, sessaoExpirada: true })
  })

  it('o arquivo sobe para a URL assinada que o servidor devolveu, antes de confirmar', async () => {
    const servidor = criarServidorFalso()
    const repo = montarHttp(servidor)
    const d = await repo.carregar()
    await repo.enviarDocumento({ tipo: 'venda', id: d.processos[0]!.id }, arquivo(), { categoria: 'pessoas' })
    expect(servidor.subidas).toHaveLength(1)
    expect(servidor.subidas[0]).toMatch(/^https:\/\/storage\.falso\/pend-/)
    const ordem = servidor.chamadas.map((c) => c.url).filter((u) => u.includes('documentos'))
    expect(ordem[0]).toBe('/api/gestao/documentos/upload')
    expect(ordem[1]).toMatch(/\/confirmar$/)
  })

  it('sem arquivo de verdade não há envio (nada de «documento» só com nome)', async () => {
    const repo = montarHttp()
    const d = await repo.carregar()
    const r = await repo.enviarDocumento({ tipo: 'venda', id: d.processos[0]!.id }, { name: 'RG.pdf', size: 4 }, { categoria: 'pessoas' })
    expect(r).toMatchObject({ ok: false, erro: 'Escolha um arquivo.' })
  })
})
