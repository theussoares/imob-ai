import { criarClienteGestao, type ClienteGestao, type Fetcher } from '../services/clienteGestao'
import { tokenVigente } from '../services/tokensGestao'

/** `true` quando o painel fala com `/api/gestao/**` (NUXT_PUBLIC_GESTAO_BACKEND=http). Qualquer outro valor é `mock`. */
export const useGestaoHttp = (): boolean => useRuntimeConfig().public.gestaoBackend === 'http'

/**
 * Cliente HTTP do painel, com o `Authorization: Bearer` do token em memória. 401 numa chamada
 * autenticada derruba a sessão local e manda para o login: o token venceu, ou o membro foi
 * removido, ou o recurso foi desligado — em todos o painel não tem mais o que mostrar.
 */
export function useGestaoApi(): ClienteGestao {
  const { sair } = useGestaoSessao()
  const router = useRouter()
  return criarClienteGestao({
    fetcher: $fetch as unknown as Fetcher,
    token: tokenVigente,
    aoSessaoExpirada: () => {
      void sair().then(() => {
        if (router.currentRoute.value.path !== '/gestao/login') void navigateTo('/gestao/login')
      })
    },
  })
}
