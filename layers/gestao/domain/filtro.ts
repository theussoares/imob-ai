import type { Corretor, Processo, StatusVenda } from './types'

export interface FiltroProcessos {
  q: string
  /** '' = todos os status */
  status: StatusVenda | ''
}

/**
 * Minúsculo e sem acento: «jose» tem de achar «José», e «Aguardando
 * documentacao» o status acentuado. O NFD separa a letra do diacrítico e a
 * regex descarta só o diacrítico — `toLowerCase` sozinho deixaria o «é» de fora.
 */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}

const soDigitos = (s: string) => s.replace(/\D/g, '')

/**
 * Filtra por busca livre + status. A busca casa em qualquer um dos campos que o
 * corretor lembra de cabeça (pessoas, imóvel, corretor, id, status), com todos
 * os termos exigidos (AND): «silva rua» estreita, em vez de alargar.
 *
 * CPF casa pelos dígitos, não pelo texto: o seed guarda «123.456.789-00» e quem
 * digita costuma colar só os números (ou só um pedaço). Termo sem dígito nunca
 * casa CPF — senão «a» bateria em qualquer processo com CPF vazio.
 */
export function filtrarProcessos(
  processos: Processo[],
  { q, status }: FiltroProcessos,
  corretores: Corretor[],
): Processo[] {
  const nomeCorretor = new Map(corretores.map((c) => [c.id, c.nome]))
  const termos = normalizar(q).split(/\s+/).filter(Boolean)

  return processos.filter((p) => {
    if (status && p.status !== status) return false
    if (!termos.length) return true

    const texto = normalizar(
      [p.id, p.vendedor.nome, p.comprador.nome, p.imovel, nomeCorretor.get(p.corretorId) ?? '', p.status].join(' | '),
    )
    const cpfs = [soDigitos(p.vendedor.cpf), soDigitos(p.comprador.cpf)]

    return termos.every((t) => {
      if (texto.includes(t)) return true
      const d = soDigitos(t)
      return d.length > 0 && cpfs.some((c) => c.includes(d))
    })
  })
}
