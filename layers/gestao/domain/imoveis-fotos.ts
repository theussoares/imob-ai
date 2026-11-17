import type { FotoImovel } from './imoveis.ts'

/** Teto por imóvel: no mock as fotos moram no localStorage (~5 MB para o painel todo). */
export const FOTOS_IMOVEL_MAX = 6
/** Caracteres do data URL depois de reduzida no navegador (~300 KB). */
export const FOTO_TAMANHO_MAX = 400_000

export interface FotoNova {
  url: string
  alt: string | null
}

export type ResultadoFotos = { ok: true; fotos: FotoImovel[] } | { ok: false; erro: string }

const renumerar = (fotos: FotoImovel[]): FotoImovel[] => fotos.map((f, position) => ({ ...f, position }))

export function adicionarFotos(fotos: FotoImovel[], novas: FotoNova[], novoId: () => string): ResultadoFotos {
  if (fotos.length + novas.length > FOTOS_IMOVEL_MAX) return { ok: false, erro: `Cada imóvel aceita no máximo ${FOTOS_IMOVEL_MAX} fotos.` }
  for (const n of novas) {
    if (!n.url.startsWith('data:image/')) return { ok: false, erro: 'O arquivo precisa ser uma imagem.' }
    if (n.url.length >= FOTO_TAMANHO_MAX) return { ok: false, erro: 'A foto é grande demais depois de reduzida.' }
  }
  const todas = [...fotos, ...novas.map((n) => ({ id: novoId(), url: n.url, alt: n.alt, position: 0, isCover: false }))]
  const comCapa = todas.some((f) => f.isCover) ? todas : todas.map((f, i) => ({ ...f, isCover: i === 0 }))
  return { ok: true, fotos: renumerar(comCapa) }
}

export const definirCapa = (fotos: FotoImovel[], id: string): FotoImovel[] => fotos.map((f) => ({ ...f, isCover: f.id === id }))

export function removerFoto(fotos: FotoImovel[], id: string): FotoImovel[] {
  const resto = fotos.filter((f) => f.id !== id)
  const comCapa = resto.length && !resto.some((f) => f.isCover) ? resto.map((f, i) => ({ ...f, isCover: i === 0 })) : resto
  return renumerar(comCapa)
}

export function moverFoto(fotos: FotoImovel[], id: string, direcao: 'cima' | 'baixo'): FotoImovel[] {
  const i = fotos.findIndex((f) => f.id === id)
  const j = direcao === 'cima' ? i - 1 : i + 1
  if (i < 0 || j < 0 || j >= fotos.length) return renumerar(fotos)
  const copia = [...fotos]
  ;[copia[i], copia[j]] = [copia[j]!, copia[i]!]
  return renumerar(copia)
}
