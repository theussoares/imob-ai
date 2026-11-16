import { normalizar } from './filtro.ts'
import type { Corretor, Locacao, StatusLocacao } from './types'

export interface FiltroLocacoes {
  q: string
  /** '' = todos os status */
  status: StatusLocacao | ''
}

const soDigitos = (s: string) => s.replace(/\D/g, '')

/** Mesma busca das vendas: todos os termos (AND), sem acento; CPF casa pelos dígitos. */
export function filtrarLocacoes(locacoes: Locacao[], { q, status }: FiltroLocacoes, corretores: Corretor[]): Locacao[] {
  const nomeCorretor = new Map(corretores.map((c) => [c.id, c.nome]))
  const termos = normalizar(q).split(/\s+/).filter(Boolean)

  return locacoes.filter((l) => {
    if (status && l.status !== status) return false
    if (!termos.length) return true
    const texto = normalizar(
      [l.id, l.locador.nome, l.locatario.nome, l.imovel, nomeCorretor.get(l.corretorId) ?? '', l.status].join(' | '),
    )
    const cpfs = [soDigitos(l.locador.cpf), soDigitos(l.locatario.cpf)]
    return termos.every((t) => {
      if (texto.includes(t)) return true
      const d = soDigitos(t)
      return d.length > 0 && cpfs.some((c) => c.includes(d))
    })
  })
}
