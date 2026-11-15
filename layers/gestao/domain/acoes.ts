import { statusFinal, TOTAL_ETAPAS } from './status'
import { STATUS_INICIAL } from './seed'
import type { Documento, CategoriaDocumento, Processo, StatusVenda } from './types'

/**
 * Transições de estado do painel, como funções PURAS: recebem o estado e
 * devolvem um novo. O store do cliente só as chama e persiste. Por que não
 * mutar direto no componente: é aqui que mora a regra («concluída só avança a
 * etapa em ordem», «final é só leitura») e só funções puras dão para testar em
 * Node sem subir o Nuxt. Quando o backend existir, estas regras migram para o
 * servidor sem mudar a tela.
 */

export interface Estado {
  processos: Processo[]
  documentos: Documento[]
}

export interface Ator {
  nome: string
}

export type Resultado = { ok: true; estado: Estado } | { ok: false; erro: string }

export const agora = (d = new Date()): string => {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function atualiza(estado: Estado, id: string, fn: (p: Processo) => Processo): Estado {
  return { ...estado, processos: estado.processos.map((p) => (p.id === id ? fn(p) : p)) }
}

function comEvento(p: Processo, acao: string, ator: Ator, quando: string): Processo {
  return { ...p, updated: quando, hist: [{ acao, quem: ator.nome, quando }, ...p.hist] }
}

/** Próximo número no padrão V-AAAA-NNNN, sempre acima do maior existente. */
export function proximoId(processos: Processo[], ano = new Date().getFullYear()): string {
  const prefixo = `V-${ano}-`
  const maior = processos
    .filter((p) => p.id.startsWith(prefixo))
    .reduce((m, p) => Math.max(m, Number(p.id.slice(prefixo.length)) || 0), 0)
  return `${prefixo}${String(maior + 1).padStart(4, '0')}`
}

export interface NovoProcesso {
  imovel: string
  vendedor: string
  comprador: string
  corretorId: string
  captadorId?: string
}

export function abrirProcesso(estado: Estado, dados: NovoProcesso, ator: Ator, quando = agora()): Resultado {
  const faltando = (['imovel', 'vendedor', 'comprador'] as const).find((k) => !dados[k]?.trim())
  if (faltando) {
    const nome = { imovel: 'o imóvel', vendedor: 'o vendedor', comprador: 'o comprador' }[faltando]
    return { ok: false, erro: `Informe ${nome}.` }
  }
  const id = proximoId(estado.processos)
  const novo: Processo = {
    id,
    tipo: 'venda',
    vendedor: { nome: dados.vendedor.trim(), cpf: '' },
    comprador: { nome: dados.comprador.trim(), cpf: '' },
    imovel: dados.imovel.trim(),
    corretorId: dados.corretorId,
    captadorId: dados.captadorId ?? dados.corretorId,
    status: STATUS_INICIAL,
    updated: quando,
    valor: 0,
    pct: 5,
    fin: { forma: 'À vista', financiado: 0, entrada: 0, fgts: 0, proprios: 0 },
    etapa: 1,
    concluidas: Array.from({ length: TOTAL_ETAPAS }, () => false),
    adiantamentos: [],
    hist: [{ acao: 'Abriu o processo', quem: ator.nome, quando }],
    obs: '',
    pdf: false,
    arquivado: false,
  }
  return { ok: true, estado: { ...estado, processos: [novo, ...estado.processos] } }
}

export function mudarStatus(estado: Estado, id: string, status: StatusVenda, ator: Ator, quando = agora()): Resultado {
  const p = estado.processos.find((x) => x.id === id)
  if (!p) return { ok: false, erro: 'Processo não encontrado.' }
  if (statusFinal(p.status)) return { ok: false, erro: 'Este processo está encerrado e só aceita consulta.' }
  const next = atualiza(estado, id, (x) => {
    const concluida = status === 'Venda concluída'
    const base = comEvento({ ...x, status }, `Mudou o status para ${status}`, ator, quando)
    return concluida ? { ...base, concluidas: base.concluidas.map(() => true), etapa: TOTAL_ETAPAS } : base
  })
  return { ok: true, estado: next }
}

/**
 * Conclui a etapa atual e avança. Só a etapa atual pode ser concluída: pular
 * etapa deixaria o stepper mostrar «4 de 8» com a 2 em branco.
 */
export function concluirEtapa(estado: Estado, id: string, etapa: number, ator: Ator, quando = agora()): Resultado {
  const p = estado.processos.find((x) => x.id === id)
  if (!p) return { ok: false, erro: 'Processo não encontrado.' }
  if (statusFinal(p.status)) return { ok: false, erro: 'Este processo está encerrado e só aceita consulta.' }
  if (etapa !== p.etapa) return { ok: false, erro: 'Conclua as etapas em ordem.' }
  if (etapa >= TOTAL_ETAPAS) return { ok: false, erro: 'A última etapa se conclui concluindo a venda.' }
  const next = atualiza(estado, id, (x) => {
    const concluidas = x.concluidas.map((c, i) => (i === etapa - 1 ? true : c))
    return comEvento({ ...x, concluidas, etapa: etapa + 1 }, `Concluiu a etapa ${etapa}`, ator, quando)
  })
  return { ok: true, estado: next }
}

export function enviarDocumento(
  estado: Estado,
  dados: { nome: string; categoria: CategoriaDocumento; processoId: string; tamanho: number },
  ator: Ator,
): Resultado {
  if (!dados.nome.trim()) return { ok: false, erro: 'Escolha um arquivo.' }
  if (!/\.(pdf|jpe?g|png|webp)$/i.test(dados.nome)) return { ok: false, erro: 'Use PDF, JPG, PNG ou WEBP.' }
  if (dados.tamanho > 20 * 1024 * 1024) return { ok: false, erro: 'O arquivo passa de 20 MB.' }
  if (!estado.processos.some((p) => p.id === dados.processoId)) return { ok: false, erro: 'Escolha o processo do documento.' }
  const id = `d${estado.documentos.length + 1}-${Date.now().toString(36)}`
  const documento: Documento = {
    id,
    nome: dados.nome.trim(),
    categoria: dados.categoria,
    processoId: dados.processoId,
    estado: 'enviado',
    tamanho: dados.tamanho,
    versoes: 1,
    enviadoPor: ator.nome,
    apagado: null,
  }
  return { ok: true, estado: { ...estado, documentos: [documento, ...estado.documentos] } }
}

export function substituirDocumento(estado: Estado, docId: string, tamanho: number): Resultado {
  if (!estado.documentos.some((d) => d.id === docId)) return { ok: false, erro: 'Documento não encontrado.' }
  return {
    ok: true,
    estado: {
      ...estado,
      documentos: estado.documentos.map((d) =>
        d.id === docId ? { ...d, versoes: d.versoes + 1, tamanho, estado: 'enviado' } : d,
      ),
    },
  }
}

/** Apagar NÃO exclui: vai para a lixeira com quem e quando, e dá para restaurar. */
export function apagarDocumento(estado: Estado, docId: string, ator: Ator, quando = agora()): Resultado {
  const d = estado.documentos.find((x) => x.id === docId)
  if (!d) return { ok: false, erro: 'Documento não encontrado.' }
  if (d.apagado) return { ok: false, erro: 'Este documento já está na lixeira.' }
  return {
    ok: true,
    estado: {
      ...estado,
      documentos: estado.documentos.map((x) => (x.id === docId ? { ...x, apagado: { quem: ator.nome, quando } } : x)),
    },
  }
}

export function restaurarDocumento(estado: Estado, docId: string): Resultado {
  const d = estado.documentos.find((x) => x.id === docId)
  if (!d) return { ok: false, erro: 'Documento não encontrado.' }
  if (!d.apagado) return { ok: false, erro: 'Este documento não está na lixeira.' }
  return {
    ok: true,
    estado: { ...estado, documentos: estado.documentos.map((x) => (x.id === docId ? { ...x, apagado: null } : x)) },
  }
}

export function conferirDocumento(estado: Estado, docId: string): Resultado {
  if (!estado.documentos.some((d) => d.id === docId)) return { ok: false, erro: 'Documento não encontrado.' }
  return {
    ok: true,
    estado: { ...estado, documentos: estado.documentos.map((d) => (d.id === docId ? { ...d, estado: 'conferido' } : d)) },
  }
}
