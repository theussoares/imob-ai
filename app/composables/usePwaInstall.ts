/**
 * Estado da instalação do painel como app.
 *
 * Três situações diferentes, e a UI precisa distinguir as três:
 *
 * - **podeInstalar**: o navegador disparou `beforeinstallprompt` e guardamos o
 *   evento. Só aí existe botão que instala de verdade.
 * - **somenteInstrucao**: iOS. O Safari nunca dispara esse evento — lá a
 *   instalação é manual, pelo menu Compartilhar. Sem este caso o painel
 *   simplesmente não teria como ser instalado no iPhone, que é metade do
 *   parque de celular dos corretores.
 * - **instalado**: já está rodando em janela própria. Oferecer instalação de
 *   novo é ruído.
 *
 * Quem preenche é `app/plugins/pwa.client.ts`, que precisa escutar o evento
 * cedo — ele dispara logo depois do load e é perdido se ninguém o segurar.
 */
export function usePwaInstall() {
  const podeInstalar = useState('pwa-pode-instalar', () => false)
  const somenteInstrucao = useState('pwa-instrucao-manual', () => false)
  const instalado = useState('pwa-instalado', () => false)
  const acao = useState<{ instalar: () => Promise<void> }>('pwa-acao-instalar', () => ({
    instalar: async () => {},
  }))

  return {
    podeInstalar,
    somenteInstrucao,
    instalado,
    get instalar() {
      return acao.value.instalar
    },
    set instalar(fn: () => Promise<void>) {
      acao.value = { instalar: fn }
    },
  }
}
