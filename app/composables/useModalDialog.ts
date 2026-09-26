import type { Ref } from 'vue'

/**
 * O comportamento de um diálogo em tela cheia, sem o conteúdo dele.
 *
 * Nasceu dentro da galeria do imóvel e saiu de lá quando o "Quem somos" ganhou
 * visualizador de fotos: cada item abaixo é um bug que já existiu, e uma
 * segunda cópia voltaria a ter algum deles na primeira alteração.
 *
 * - Foco volta a quem abriu. Sem isto caía no `<body>`, e quem navega por
 *   teclado voltava ao topo da página (padrão de diálogo da WAI-ARIA APG).
 * - Tab preso dentro do diálogo. `aria-modal` avisa o leitor de tela, mas não
 *   segura o teclado: o Tab saía e ia focando links da página escondida atrás.
 * - Esc fecha.
 * - Scroll do fundo travado enquanto está aberto, e destravado se a tela
 *   desmontar com ele aberto (navegar pelo botão "voltar" do celular).
 *
 * `show` recebe quem deve ganhar o foco ao abrir — normalmente o "Fechar".
 */
export function useModalDialog(el: Ref<HTMLElement | null>) {
  const open = ref(false)
  let opener: HTMLElement | null = null

  async function show(focusOnOpen?: () => HTMLElement | null | undefined) {
    opener = import.meta.client ? (document.activeElement as HTMLElement | null) : null
    open.value = true
    await nextTick()
    focusOnOpen?.()?.focus()
  }

  async function hide() {
    open.value = false
    await nextTick()
    opener?.focus()
    opener = null
  }

  onKeyStroke('Tab', (e) => {
    if (!open.value || !el.value) return
    const focaveis = [
      ...el.value.querySelectorAll<HTMLElement>("button:not([disabled]), [href], [tabindex]:not([tabindex='-1'])"),
    ]
    if (!focaveis.length) return
    const primeiro = focaveis[0]!
    const ultimo = focaveis[focaveis.length - 1]!
    const atual = document.activeElement
    if (e.shiftKey && (atual === primeiro || !el.value.contains(atual))) {
      e.preventDefault()
      ultimo.focus()
    } else if (!e.shiftKey && (atual === ultimo || !el.value.contains(atual))) {
      e.preventDefault()
      primeiro.focus()
    }
  })
  onKeyStroke('Escape', () => open.value && hide())

  watch(open, (aberto) => {
    if (import.meta.client) document.documentElement.style.overflow = aberto ? 'hidden' : ''
  })
  onBeforeUnmount(() => {
    if (import.meta.client) document.documentElement.style.overflow = ''
  })

  return { open, show, hide }
}
