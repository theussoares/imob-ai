import type { Estado } from '../../domain/acoes'
import { type EstadoAuth, estadoAuthVazio } from '../../domain/auth'
import { configuracoesPadrao, type ConfiguracoesGestao } from '../../domain/configuracoes'
import { matrizPadrao, PERFIS, sessaoDoPerfil } from '../../domain/permissions'
import type { MatrizPermissoes, Perfil, Sessao } from '../../domain/types'
import { limparTokens, renovarSessao, tokenAtual } from '../services/tokensGestao'

const CHAVE = 'gestao-sessao'

/**
 * Estado do painel que pertence a quem estava logado: sair devolve tudo ao valor inicial, senão o
 * próximo login veria os dados do anterior. Atribui o valor inicial em vez de `clearNuxtState`
 * (que pode deixar `undefined` e quebrar a tela que ainda está montada até a navegação terminar).
 */
function zerarEstadoDaSessao() {
  useState<Estado>('gestao:estado').value = { processos: [], documentos: [], locacoes: [] }
  useState<boolean>('gestao:carregado').value = false
  useState<unknown[]>('gestao:imoveis').value = []
  useState<MatrizPermissoes>('gestao:matriz').value = matrizPadrao()
  useState<ConfiguracoesGestao>('gestao:config').value = configuracoesPadrao()
  useState<unknown[]>('gestao:consultas').value = []
  useState<Record<string, number>>('gestao:versoes').value = {}
  useState<unknown[]>('gestao:corretores').value = []
  useState<string>('gestao:erro-carga').value = ''
  // Lista de membros e convites que o Dono carregou: o próximo a entrar neste navegador não a lê.
  useState<EstadoAuth>('gestao:auth').value = estadoAuthVazio()
  useState<string | null>('gestao:2fa-pendente').value = null
  useState<number>('gestao:reenvio-em').value = 0
}

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

  /**
   * `http`: depois do F5, tenta reabrir a sessão pelo cookie HttpOnly (renova o token e lê
   * `/sessao`). Uma vez por carregamento do SPA. Sem cookie, ou sem 2º fator cumprido (o `/sessao`
   * responde 401), segue sem sessão e o middleware manda ao login; o token renovado fica em
   * memória para quem parou na tela do código.
   */
  const tentada = useState<boolean>('gestao:restauracao-http', () => false)
  async function restaurarHttp() {
    if (!http || tentada.value || sessao.value || !import.meta.client) return
    tentada.value = true
    if (!(await renovarSessao())) return
    try {
      // `$fetch` direto, e não `useGestaoApi()`: quem parou na tela do código recebe 401
      // («segundo_fator») aqui, e o cliente trata todo 401 como sessão vencida, apagando o
      // cookie e mandando ao login — o F5 na verificação perderia o login já feito.
      const r = await $fetch<{ sessao: Sessao; matriz: MatrizPermissoes }>('/api/gestao/sessao', {
        headers: { authorization: `Bearer ${tokenAtual()}` },
      })
      sessao.value = r.sessao
      useState<MatrizPermissoes | null>('gestao:matriz').value = r.matriz
    } catch {
      /* sem 2º fator (401) ou removido: fica deslogado */
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
      zerarEstadoDaSessao()
      return
    }
    try {
      localStorage.removeItem(CHAVE)
    } catch {
      /* idem */
    }
  }

  return { sessao, restaurar, restaurarHttp, entrar, definir, sair }
}
