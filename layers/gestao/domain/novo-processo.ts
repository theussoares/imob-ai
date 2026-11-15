import type { Estado, Resultado } from './acoes'
import type { Pessoa } from './types'

/**
 * Complemento do «Novo processo»: telefone, e-mail e contrato PDF. Vive aqui, e
 * não em `acoes.abrirProcesso`, porque aquele arquivo é de outra frente; o
 * modal cria o processo e depois chama `completarProcesso`. Duas passadas
 * deixam um instante em que o processo existe sem contato — aceitável no demo
 * (tudo síncrono, em memória), mas `abrirProcesso` deveria aceitar estes campos.
 */

export const LIMITE_PDF = 20 * 1024 * 1024

/** Só o formato mínimo (algo@algo.tld): confirmar a caixa postal é com o servidor. */
export const emailValido = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim())

/** 10 ou 11 dígitos (DDD + número), aceitando máscara, espaço e +55. */
export function telefoneValido(s: string): boolean {
  let d = s.replace(/\D/g, '')
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2)
  return d.length === 10 || d.length === 11
}

export interface ContatoPessoa {
  telefone: string
  email: string
}

/** Opcional: vazio passa; preenchido tem de estar no formato. */
export function validarContato(rotulo: string, c: ContatoPessoa): string | null {
  if (c.telefone.trim() && !telefoneValido(c.telefone)) return `Telefone do ${rotulo} inválido. Use DDD + número.`
  if (c.email.trim() && !emailValido(c.email)) return `E-mail do ${rotulo} inválido.`
  return null
}

export function validarPdf(arquivo: { name: string; size: number } | null): string | null {
  if (!arquivo) return null
  if (!/\.pdf$/i.test(arquivo.name)) return 'O contrato precisa ser um PDF.'
  if (arquivo.size > LIMITE_PDF) return 'O PDF passa de 20 MB.'
  return null
}

export interface ComplementoProcesso {
  vendedor: ContatoPessoa
  comprador: ContatoPessoa
  pdf: boolean
}

function comContato(p: Pessoa, c: ContatoPessoa): Pessoa {
  const telefone = c.telefone.trim()
  const email = c.email.trim()
  return { ...p, ...(telefone && { telefone }), ...(email && { email }) }
}

export function completarProcesso(estado: Estado, id: string, extra: ComplementoProcesso): Resultado {
  if (!estado.processos.some((p) => p.id === id)) return { ok: false, erro: 'Processo não encontrado.' }
  return {
    ok: true,
    estado: {
      ...estado,
      processos: estado.processos.map((p) =>
        p.id === id
          ? { ...p, vendedor: comContato(p.vendedor, extra.vendedor), comprador: comContato(p.comprador, extra.comprador), pdf: extra.pdf }
          : p,
      ),
    },
  }
}
