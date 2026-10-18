import { GRAVACAO_MAX_SEGUNDOS, formatoDeGravacao, type FormatoDeGravacao } from '~~/shared/models/whatsapp'

/**
 * Gravação de áudio pelo microfone, para mandar como mensagem de voz.
 *
 * O formato sai de `formatoDeGravacao`: só o que a Meta aceita. O navegador
 * que não grava em nenhum deles fica sem o botão de gravar — melhor do que
 * gravar e descobrir no envio que o áudio não sai.
 *
 * O microfone é liberado assim que a gravação termina ou é cancelada. Sem
 * isso o navegador continua mostrando o indicador de "microfone em uso", e a
 * pessoa acha que o painel está ouvindo.
 */
export function useGravadorDeAudio() {
  const estado = ref<'parado' | 'pedindo' | 'gravando'>('parado')
  const segundos = ref(0)
  const formato = ref<FormatoDeGravacao | null>(null)
  const suportado = ref(false)

  onMounted(() => {
    const ok = typeof window !== 'undefined' && 'MediaRecorder' in window && Boolean(navigator.mediaDevices?.getUserMedia)
    formato.value = ok ? formatoDeGravacao((m) => MediaRecorder.isTypeSupported(m)) : null
    suportado.value = Boolean(formato.value)
  })

  let gravador: MediaRecorder | null = null
  let fluxo: MediaStream | null = null
  let pedacos: Blob[] = []
  let relogio: ReturnType<typeof setInterval> | null = null
  let aoTerminar: ((f: File | null) => void) | null = null

  function soltarMicrofone() {
    fluxo?.getTracks().forEach((t) => t.stop())
    fluxo = null
    if (relogio) clearInterval(relogio)
    relogio = null
  }

  /** Começa a gravar. Rejeita com frase legível se o microfone for negado. */
  async function iniciar(): Promise<void> {
    if (!formato.value || estado.value !== 'parado') return
    estado.value = 'pedindo'
    try {
      fluxo = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
    } catch (e) {
      estado.value = 'parado'
      const negado = (e as DOMException)?.name === 'NotAllowedError'
      throw new Error(
        negado
          ? 'O navegador não liberou o microfone. Libere nas permissões do site (o cadeado ao lado do endereço) e tente de novo.'
          : 'Nenhum microfone encontrado.',
      )
    }
    pedacos = []
    gravador = new MediaRecorder(fluxo, { mimeType: formato.value.mimeDoGravador, audioBitsPerSecond: 32000 })
    gravador.ondataavailable = (ev) => {
      if (ev.data.size) pedacos.push(ev.data)
    }
    gravador.onstop = () => {
      soltarMicrofone()
      const f = formato.value!
      // Tipo SEM o `codecs`: o bucket compara o tipo base (0060), e o
      // servidor decide o formato pela extensão.
      const arquivo = pedacos.length
        ? new File([new Blob(pedacos, { type: f.mime })], `audio-${Date.now()}.${f.ext}`, { type: f.mime })
        : null
      pedacos = []
      estado.value = 'parado'
      aoTerminar?.(arquivo)
      aoTerminar = null
    }
    segundos.value = 0
    relogio = setInterval(() => {
      segundos.value++
      if (segundos.value >= GRAVACAO_MAX_SEGUNDOS) parar()
    }, 1000)
    gravador.start(1000)
    estado.value = 'gravando'
  }

  /** Termina e devolve o arquivo (null se nada foi gravado). */
  function parar(): Promise<File | null> {
    return new Promise((ok) => {
      if (!gravador || gravador.state === 'inactive') return ok(null)
      aoTerminar = ok
      gravador.stop()
    })
  }

  /** Descarta o que foi gravado. */
  function cancelar() {
    aoTerminar = null
    if (gravador && gravador.state !== 'inactive') {
      gravador.onstop = () => {
        soltarMicrofone()
        pedacos = []
        estado.value = 'parado'
      }
      gravador.stop()
    } else {
      soltarMicrofone()
      estado.value = 'parado'
    }
  }

  onBeforeUnmount(cancelar)

  return { estado, segundos, suportado, iniciar, parar, cancelar }
}
