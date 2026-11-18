/**
 * Tema do painel: claro, escuro ou o do sistema. A escolha fica no navegador (localStorage), só neste
 * aparelho; o servidor não a conhece. Alternativa descartada: cookie — o servidor não precisa dela (as
 * rotas /gestao não renderizam no servidor) e um cookie a mais entraria na política de privacidade
 * sem ganho. O primeiro quadro, antes do JavaScript, é pintado pelo script do esqueleto
 * (`server/utils/gestao-splash.ts`), que lê a MESMA chave.
 */
export type PreferenciaTema = 'sistema' | 'claro' | 'escuro'
export const CHAVE_TEMA_GESTAO = 'gestao_tema'

export function useGestaoTema() {
  const preferencia = useState<PreferenciaTema>('gestao-tema', () => 'sistema')

  function aplicar() {
    if (!import.meta.client) return
    const escuro =
      preferencia.value === 'escuro' ||
      (preferencia.value === 'sistema' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    document.documentElement.classList.toggle('gestao-escuro', escuro)
  }

  function definir(p: PreferenciaTema) {
    preferencia.value = p
    try {
      if (p === 'sistema') localStorage.removeItem(CHAVE_TEMA_GESTAO)
      else localStorage.setItem(CHAVE_TEMA_GESTAO, p)
    } catch {
      // Armazenamento bloqueado: o tema vale só nesta sessão.
    }
    aplicar()
  }

  function iniciar() {
    try {
      const v = localStorage.getItem(CHAVE_TEMA_GESTAO)
      if (v === 'claro' || v === 'escuro') preferencia.value = v
    } catch {
      // ver acima
    }
    aplicar()
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', aplicar)
  }

  return { preferencia, definir, iniciar }
}
