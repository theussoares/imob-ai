import { configuracoesPadrao } from '../../domain/configuracoes'
import { locacoesSeed } from '../../domain/locacao-seed'
import { matrizPadrao } from '../../domain/permissions'
import { CORRETORES, documentosSeedCompleto, processosSeed } from '../../domain/seed'
import type { Documento } from '../../domain/types'
import type { Fetcher } from '../../app/services/clienteGestao'
import type { ArmazemGestao, DadosGestao } from '../../app/services/GestaoRepository'
import { MockGestaoRepository } from '../../app/services/MockGestaoRepository'

export const dadosIniciais = (): DadosGestao => ({
  processos: processosSeed(),
  locacoes: locacoesSeed(),
  documentos: documentosSeedCompleto(),
  matriz: matrizPadrao(),
  config: configuracoesPadrao(),
  consultas: [],
  corretores: CORRETORES,
})

/** Armazém em memória: o «banco» do servidor falso e o localStorage do mock. */
export function armazemEmMemoria(inicial: DadosGestao = dadosIniciais()): ArmazemGestao & { atual(): DadosGestao } {
  let dados = inicial
  return {
    ler: () => dados,
    gravar: (d) => ((dados = d), true),
    lerPersistido: () => dados,
    limparPersistido: () => {},
    atual: () => dados,
  }
}

/** Erro no formato do `FetchError` do ofetch: `status` + corpo do h3 (`statusMessage`, `data`). */
class ErroFetchFalso extends Error {
  readonly data: unknown
  constructor(readonly status: number, mensagem: string) {
    super(mensagem)
    this.data = { statusCode: status, statusMessage: mensagem, data: { erro: mensagem } }
  }
}

export const MSG_409 = 'Este processo foi alterado por outra pessoa. Recarregue.'

/**
 * Servidor falso do `/api/gestao/**`: as MESMAS funções puras do domínio que o servidor real roda
 * (via `MockGestaoRepository` sobre um armazém próprio), atrás das rotas e dos códigos HTTP do
 * contrato (404 / 409 / 422 / 401). O que o teste de contrato exercita é o CLIENTE: rota, corpo,
 * `versao`, tradução de erro. A regra em si é testada em `test/server/**`.
 */
export function criarServidorFalso(opts: { tokenValido?: string } = {}) {
  const banco = armazemEmMemoria()
  const repo = new MockGestaoRepository(banco, () => ({ nome: 'Servidor' }), async () => { throw new Error('sem semente') }, () => '17/11/2026 10:00')
  const versoes = new Map<string, number>()
  const pendentes = new Map<string, { alvo: { tipo: 'venda' | 'locacao'; id: string }; categoria: string; requisito?: string; documentoId?: string; nome: string; tamanho: number }>()
  const chamadas: { metodo: string; url: string; auth: string | undefined }[] = []
  let n = 0

  const ver = (chave: string) => versoes.get(chave) ?? 1
  const doc = (id: string): Documento => {
    const d = banco.atual().documentos.find((x) => x.id === id)
    if (!d) throw new ErroFetchFalso(404, 'Não encontrado.')
    return d
  }
  const tipoDe = (id: string) => (banco.atual().processos.some((p) => p.id === id) ? ('venda' as const) : ('locacao' as const))
  /**
   * O servidor real liga/desliga `pdf` conforme os documentos da categoria `venda` do processo e
   * sobe a `versao` dele (`gestao-venda-pdf.ts`). O cliente tem de acompanhar essa versão.
   */
  const sincronizarPdf = (d: Documento) => {
    if (d.categoria !== 'venda' || !banco.atual().processos.some((p) => p.id === d.processoId)) return
    const deveTer = banco.atual().documentos.some((x) => x.processoId === d.processoId && x.categoria === 'venda' && !x.apagado)
    const atual = banco.atual()
    if (atual.processos.find((p) => p.id === d.processoId)!.pdf === deveTer) return
    banco.gravar({ ...atual, processos: atual.processos.map((p) => (p.id === d.processoId ? { ...p, pdf: deveTer } : p)) })
    versoes.set(`venda:${d.processoId}`, ver(`venda:${d.processoId}`) + 1)
  }
  const comoErro = (r: { ok: false; erro: string }): never => {
    throw new ErroFetchFalso(422, r.erro)
  }
  const venda = (id: string) => {
    const processo = banco.atual().processos.find((p) => p.id === id)
    if (!processo) throw new ErroFetchFalso(404, 'Não encontrado.')
    return { versao: ver(`venda:${id}`), processo }
  }
  const locacao = (id: string) => {
    const l = banco.atual().locacoes.find((x) => x.id === id)
    if (!l) throw new ErroFetchFalso(404, 'Locação não encontrada.')
    return { versao: ver(`locacao:${id}`), locacao: l, avisos: [] }
  }

  const fetcher: Fetcher = async <T>(url: string, o: { method?: string; body?: unknown; query?: Record<string, unknown>; headers?: Record<string, string> } = {}) => {
    const metodo = o.method ?? 'GET'
    const autorizacao = o.headers?.Authorization
    chamadas.push({ metodo, url, auth: autorizacao })
    const rota = url.replace('/api/gestao/', '')
    const livre = rota.startsWith('auth/login') || rota.startsWith('auth/aceitar') || rota.startsWith('auth/convite')
    if (!livre && autorizacao !== `Bearer ${opts.tokenValido ?? 'tok'}`) throw new ErroFetchFalso(401, 'Sessão inválida.')
    const corpo = (o.body ?? {}) as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
    const q = o.query ?? {}
    const d = banco.atual()
    const out = (x: unknown) => x as T

    if (metodo === 'GET' && rota === 'matriz') return out({ matriz: d.matriz })
    if (metodo === 'GET' && rota === 'vendas') return out(d.processos.filter((p) => !!p.arquivado === !!q.arquivados).map((p) => ({ versao: ver(`venda:${p.id}`), processo: p })))
    if (metodo === 'GET' && rota === 'locacoes') return out({ locacoes: d.locacoes.filter((l) => !!l.arquivado === !!q.arquivadas).map((l) => locacao(l.id)) })
    if (metodo === 'GET' && rota === 'corretores') return out({ corretores: d.corretores })
    if (metodo === 'GET' && rota === 'configuracoes') return out({ config: d.config })
    if (metodo === 'GET' && rota === 'consultas') return out({ consultas: d.consultas })

    if (metodo === 'POST' && rota === 'vendas') {
      const r = await repo.abrirVenda({ ...(corpo as { imovel: string; vendedor: string; comprador: string; corretorId: string }) })
      return r.ok ? out(venda(r.processo!.id)) : comoErro(r)
    }
    let m = /^vendas\/([^/]+)(\/acoes)?$/.exec(rota)
    if (m && metodo === 'GET') return out(venda(decodeURIComponent(m[1]!)))
    if (m && m[2] && metodo === 'POST') {
      const id = decodeURIComponent(m[1]!)
      venda(id)
      // Como o servidor real: sem `versao` é 422; versão diferente da gravada é 409.
      if (!Number.isInteger(corpo.versao) || corpo.versao < 1) throw new ErroFetchFalso(422, 'Informe a versão do processo.')
      if (corpo.versao !== ver(`venda:${id}`)) throw new ErroFetchFalso(409, MSG_409)
      const r = await repo.executar('venda', id, corpo.acao, corpo.dados)
      if (!r.ok) return comoErro(r)
      versoes.set(`venda:${id}`, ver(`venda:${id}`) + 1)
      return out(venda(id))
    }
    if (metodo === 'POST' && rota === 'locacoes') {
      const r = await repo.abrirLocacao(corpo as never)
      return r.ok ? out(locacao(r.locacao!.id)) : comoErro(r)
    }
    m = /^locacoes\/([^/]+)(\/acoes)?$/.exec(rota)
    if (m && metodo === 'GET') return out(locacao(decodeURIComponent(m[1]!)))
    if (m && m[2] && metodo === 'POST') {
      const id = decodeURIComponent(m[1]!)
      locacao(id)
      // Concorrência otimista: a `versao` é a que a tela leu, e só ela vale.
      if (corpo.versao !== ver(`locacao:${id}`)) throw new ErroFetchFalso(409, MSG_409)
      const r = await repo.executar('locacao', id, corpo.acao, corpo.dados)
      if (!r.ok) return comoErro(r)
      versoes.set(`locacao:${id}`, ver(`locacao:${id}`) + 1)
      return out(locacao(id))
    }

    // documentos
    if (metodo === 'GET' && rota === 'documentos') {
      const [tipo, id] = String(q.alvo).split(':') as ['venda' | 'locacao', string]
      return out(await repo.documentosDoAlvo(tipo, id))
    }
    if (metodo === 'GET' && rota === 'documentos/lixeira') return out(await repo.lixeira())
    if (metodo === 'POST' && rota === 'documentos/upload') {
      const [tipo, id] = String(corpo.alvo).split(':') as ['venda' | 'locacao', string]
      const documentoId = `pend-${++n}`
      pendentes.set(documentoId, { alvo: { tipo, id }, categoria: corpo.categoria, requisito: corpo.requisito, documentoId: corpo.documentoId, nome: corpo.nome, tamanho: corpo.tamanho })
      return out({ documentoId, uploadUrl: `https://storage.falso/${documentoId}`, token: 't', versao: 1 })
    }
    m = /^documentos\/([^/]+)\/(confirmar|conferir|apagar|restaurar|download)$/.exec(rota)
    if (m) {
      const [, id, acao] = m as unknown as [string, string, string]
      if (acao === 'confirmar') {
        const p = pendentes.get(id)
        if (!p) throw new ErroFetchFalso(404, 'Não encontrado.')
        const arquivo = { name: p.nome, size: p.tamanho }
        const r = p.documentoId
          ? await repo.novaVersaoDocumento(doc(p.documentoId), p.alvo.tipo, arquivo)
          : await repo.enviarDocumento(p.alvo, arquivo, { categoria: p.categoria as never, requisito: p.requisito })
        if (r.ok) sincronizarPdf(r.documento!)
        return r.ok ? out(r.documento) : comoErro(r)
      }
      if (acao === 'download') return out({ url: `https://storage.falso/baixar/${id}`, expiraEmSegundos: 60 })
      const r = await (acao === 'conferir' ? repo.conferirDocumento(doc(id)) : acao === 'apagar' ? repo.apagarDocumento(doc(id)) : repo.restaurarDocumento(doc(id)))
      if (r.ok) sincronizarPdf(r.documento!)
      return r.ok ? out(r.documento) : comoErro(r)
    }

    if (metodo === 'PUT' && rota === 'matriz') return out(await repo.salvarMatriz(corpo.matriz))
    if (metodo === 'PUT' && rota === 'configuracoes') return out(await repo.salvarConfig(corpo.config))
    if (metodo === 'POST' && rota === 'consultas') {
      const r = await repo.consultar(corpo as never)
      return r.ok ? out({ consulta: r.consulta }) : comoErro(r)
    }
    void tipoDe
    throw new ErroFetchFalso(404, `Rota sem servidor falso: ${metodo} ${url}`)
  }

  return { fetcher, banco, chamadas, subidas: [] as string[] }
}
