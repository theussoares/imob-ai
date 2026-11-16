import { PERFIS, sessaoDoPerfil } from '../../domain/permissions'
import type { Perfil, Sessao } from '../../domain/types'

const CHAVE = 'gestao-sessao'

/**
 * Sessão do demo: o perfil escolhido na tela de entrada, guardado no
 * localStorage. NÃO é autenticação — o MVP é uma apresentação com dados de
 * exemplo. O login real (Supabase Auth + `tenant_members`) entra no lugar disto
 * sem mudar quem consome `sessao`.
 */
export function useGestaoSessao() {
  const sessao = useState<Sessao | null>('gestao:sessao', () => null)
  const lida = useState<boolean>('gestao:sessao-lida', () => false)

  /** Lê do localStorage uma vez. Chamar antes de decidir redirecionamento. */
  function restaurar() {
    if (lida.value || !import.meta.client) return
    lida.value = true
    try {
      const bruto = localStorage.getItem(CHAVE)
      const perfil = bruto && (JSON.parse(bruto) as Perfil)
      // Perfil que não existe mais (valor antigo/adulterado) não vira sessão.
      if (perfil && perfil in PERFIS) sessao.value = sessaoDoPerfil(perfil)
    } catch {
      // localStorage bloqueado (janela anônima): segue sem sessão persistida.
    }
  }

  function entrar(perfil: Perfil) {
    sessao.value = sessaoDoPerfil(perfil)
    try {
      localStorage.setItem(CHAVE, JSON.stringify(perfil))
    } catch {
      /* idem */
    }
  }

  function sair() {
    sessao.value = null
    try {
      localStorage.removeItem(CHAVE)
    } catch {
      /* idem */
    }
  }

  return { sessao, restaurar, entrar, sair }
}
