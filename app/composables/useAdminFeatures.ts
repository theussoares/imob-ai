/**
 * Recursos opcionais ligados para esta imobiliária, do ponto de vista do painel.
 *
 * Carrega uma vez por sessão do SPA e fica em `useState`: o menu lateral e o
 * middleware das rotas perguntam a mesma coisa, e duas respostas diferentes na
 * mesma navegação apareceriam como link que some ao clicar.
 *
 * ⚠️ O padrão é `false` — recurso desligado. Se a consulta falhar (rede caiu,
 * sessão expirou), o painel esconde a tela em vez de mostrar uma que vai dar
 * erro adiante. Recurso pago erra para o lado de não oferecer.
 */
export function useAdminFeatures() {
  const estado = useState<{ areaCliente: boolean } | null>('admin:features', () => null)
  const carregando = useState('admin:features:carregando', () => false)

  async function carregar() {
    if (estado.value || carregando.value) return
    carregando.value = true
    try {
      estado.value = await adminFetch<{ areaCliente: boolean }>('/api/admin/features')
    } catch {
      // Sem barulho na tela: o menu simplesmente não oferece o que não dá para
      // confirmar. O erro real, se houver, aparece na tela que a pessoa abrir.
      estado.value = { areaCliente: false }
    } finally {
      carregando.value = false
    }
  }

  const areaCliente = computed(() => estado.value?.areaCliente === true)

  return { areaCliente, carregar, carregado: computed(() => estado.value !== null) }
}
