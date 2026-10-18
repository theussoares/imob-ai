/**
 * Popup "Conectar com o Facebook" do WhatsApp (Embedded Signup da Meta).
 *
 * Duas respostas chegam por caminhos diferentes, e as duas são necessárias:
 * - o `code` de autorização, pelo callback do `FB.login`;
 * - o número e a WABA escolhidos, por `postMessage` do popup
 *   (`WA_EMBEDDED_SIGNUP`).
 * A ordem entre elas não é garantida, então o resultado só sai quando as duas
 * chegaram.
 *
 * O SDK da Meta só é carregado no clique. Carregar ao abrir a tela colocaria
 * script da Meta em toda visita a Conversas, de quem nunca vai conectar nada.
 */

interface FB {
  init(o: { appId: string; autoLogAppEvents?: boolean; xfbml: boolean; version: string; cookie?: boolean }): void
  login(cb: (r: { authResponse?: { code?: string } | null }) => void, o: Record<string, unknown>): void
}

declare global {
  interface Window {
    FB?: FB
    fbAsyncInit?: () => void
  }
}

/** A mesma versão da Graph API do servidor (`cloud-api.ts`). */
const VERSAO = 'v24.0'

let sdk: Promise<FB> | null = null
function carregarSdk(appId: string): Promise<FB> {
  sdk ??= new Promise<FB>((ok, falha) => {
    window.fbAsyncInit = () => {
      // cookie: false — o painel não precisa de sessão do Facebook guardada;
      // o que importa é o `code` desta conexão, e nada fica depois dela.
      window.FB!.init({ appId, autoLogAppEvents: false, xfbml: false, version: VERSAO, cookie: false })
      ok(window.FB!)
    }
    const s = document.createElement('script')
    s.src = 'https://connect.facebook.net/pt_BR/sdk.js'
    s.async = true
    s.crossOrigin = 'anonymous'
    s.onerror = () => {
      sdk = null
      falha(new Error('Não foi possível carregar o Facebook. Verifique a conexão ou um bloqueador de anúncios.'))
    }
    document.head.appendChild(s)
  })
  return sdk
}

export interface ResultadoDoSignup {
  code: string
  phoneNumberId: string
  wabaId: string
}

export function useEmbeddedSignup() {
  const config = useRuntimeConfig()
  const appId = String(config.public.whatsappAppId || '')
  const configId = String(config.public.whatsappConfigId || '')
  const disponivel = computed(() => Boolean(appId && configId))

  /**
   * Abre o popup. `coexistencia`: usar o número que já está no app WhatsApp
   * Business (o corretor continua no celular). Rejeita com mensagem legível
   * quando a pessoa cancela ou fecha o popup.
   */
  async function conectar(coexistencia: boolean): Promise<ResultadoDoSignup> {
    const FB = await carregarSdk(appId)

    return new Promise<ResultadoDoSignup>((ok, falha) => {
      let code: string | null = null
      let sessao: { phoneNumberId: string; wabaId: string } | null = null
      let terminou = false

      const fim = (erro?: string) => {
        if (terminou) return
        if (erro) {
          terminou = true
          window.removeEventListener('message', aoReceber)
          return falha(new Error(erro))
        }
        if (code && sessao) {
          terminou = true
          window.removeEventListener('message', aoReceber)
          ok({ code, ...sessao })
        }
      }

      function aoReceber(ev: MessageEvent) {
        // Só o que vem da Meta. Qualquer outra janela pode mandar postMessage,
        // e o número e a WABA daqui vão para o servidor — que confere de novo,
        // mas não há por que aceitar lixo.
        let origem: URL
        try {
          origem = new URL(ev.origin)
        } catch {
          return
        }
        if (origem.protocol !== 'https:' || !/(^|\.)facebook\.com$/.test(origem.hostname)) return
        let dado: { type?: string; event?: string; data?: { phone_number_id?: string; waba_id?: string; current_step?: string } }
        try {
          dado = typeof ev.data === 'string' ? JSON.parse(ev.data) : ev.data
        } catch {
          return
        }
        if (dado?.type !== 'WA_EMBEDDED_SIGNUP') return
        if (dado.event === 'CANCEL') return fim('A conexão foi cancelada antes do fim.')
        if (dado.event === 'ERROR') return fim('A Meta interrompeu a conexão. Tente de novo.')
        const pn = dado.data?.phone_number_id
        const waba = dado.data?.waba_id
        if (pn && waba) {
          sessao = { phoneNumberId: String(pn), wabaId: String(waba) }
          fim()
        }
      }
      window.addEventListener('message', aoReceber)

      FB.login(
        (r) => {
          const c = r?.authResponse?.code
          if (!c) return fim('A conexão foi cancelada ou o popup foi fechado.')
          code = c
          // O callback pode vir antes da mensagem do popup; espera um pouco por ela.
          setTimeout(() => fim(sessao ? undefined : 'O popup terminou sem escolher um número. Tente de novo e vá até o fim.'), 15000)
          fim()
        },
        {
          config_id: configId,
          response_type: 'code',
          override_default_response_type: true,
          extras: {
            setup: {},
            sessionInfoVersion: '3',
            ...(coexistencia ? { featureType: 'whatsapp_business_app_onboarding' } : {}),
          },
        },
      )
    })
  }

  return { disponivel, conectar }
}
