import { PERFIS, sessaoDoPerfil } from '../../domain/permissions'
import type { Perfil, Sessao } from '../../domain/types'
import { limparTokens } from '../services/tokensGestao'

const CHAVE = 'gestao-sessao'

/** Estado do painel que pertence a quem estava logado: sair apaga, senão o próximo login veria os dados do anterior. */
const ESTADO_DA_SESSAO = [
  'gestao:estado',
  'gestao:carregado',
  'gestao:imoveis',
  'gestao:matriz',
  'gestao:config',
  'gestao:consultas',
  'gestao:versoes',
  'gestao:corretores',
  'gestao:erro-carga',
]

/**
 * Sessão do painel.
 *
 * `mock`: o perfil escolhido na tela de entrada, guardado no localStorage. NÃO é autenticação —
 * é uma apresentação com dados de exemplo.
 * `http`: a sessão vem do servidor (`/api/gestao/sessao`, `/auth/codigo`) e vive só em memória,
 * junto com os tokens: recarregar a página volta ao login. `sessao` é a mesma para quem consome.
 */
export function useGestaoSessao() {
  const sessao = useState<Sessao | null>('gestao:sessao', () => null)
  const lida = useState<boolean>('gestao:sessao-lida', () => false)
  const http = useGestaoHttp()

  /** Lê do localStorage uma vez. Chamar antes de decidir redirecionamento. */
  function restaurar() {
    if (lida.value || !import.meta.client) return
    lida.value = true
    // `http`: nada a restaurar, o token não é guardado.
    if (http) return
    try {
      const bruto = localStorage.getItem(CHAVE)
      const perfil = bruto && (JSON.parse(bruto) as Perfil)
      // Perfil que não existe mais (valor antigo/adulterado) não vira sessão.
      if (perfil && perfil in PERFIS) sessao.value = sessaoDoPerfil(perfil)
    } catch {
      // localStorage bloqueado (janela anônima): segue sem sessão persistida.
    }
  }

  /** Só `mock`. */
  function entrar(perfil: Perfil) {
    sessao.value = sessaoDoPerfil(perfil)
    try {
      localStorage.setItem(CHAVE, JSON.stringify(perfil))
    } catch {
      /* idem */
    }
  }

  /** Só `http`: sessão devolvida pelo servidor depois do 2º fator. */
  function definir(s: Sessao) {
    sessao.value = s
  }

  async function sair() {
    sessao.value = null
    if (http) {
      await limparTokens()
      clearNuxtState(ESTADO_DA_SESSAO)
      return
    }
    try {
      localStorage.removeItem(CHAVE)
    } catch {
      /* idem */
    }
  }

  return { sessao, restaurar, entrar, definir, sair }
}
