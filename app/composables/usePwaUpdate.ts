/**
 * Estado do aviso de "nova versão disponível" do painel.
 *
 * Fica num composable, e não dentro do plugin, porque quem escreve (o plugin,
 * ao ser avisado pelo service worker) e quem lê (o banner) não se conhecem. O
 * `useState` do Nuxt mantém isso único na aplicação.
 *
 * `aplicarAtualizacao` é preenchida pelo plugin: só ele tem a função que o
 * `registerSW` devolve. Antes disso — e em todo host que não é painel, onde o
 * plugin sai cedo — ela não faz nada, e `temAtualizacao` nunca vira true, então
 * o banner não aparece.
 */
export function usePwaUpdate() {
  const temAtualizacao = useState('pwa-tem-atualizacao', () => false)
  const estado = useState<{ aplicar: () => Promise<void> }>('pwa-aplicar', () => ({
    aplicar: async () => {},
  }))

  return {
    temAtualizacao,
    get aplicarAtualizacao() {
      return estado.value.aplicar
    },
    set aplicarAtualizacao(fn: () => Promise<void>) {
      estado.value = { aplicar: fn }
    },
  }
}
