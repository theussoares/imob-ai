import { registerSW } from 'virtual:pwa-register'
import { isAdminHost } from '~~/shared/utils/admin-host'

/**
 * Registra o service worker — e SÓ no host do painel.
 *
 * O módulo do PWA tem um plugin próprio que faz isso, mas ele roda em toda
 * página, e o mesmo app serve o site público de cada cliente. Um SW controlando
 * a origem pública passaria a responder do cache para visitantes e para o
 * Googlebot: página velha no site de quem paga pelo site. Por isso o plugin do
 * módulo está desligado (`client.registerPlugin: false` no nuxt.config) e o
 * registro acontece aqui, atrás da checagem de host.
 *
 * A checagem é pelo hostname da própria janela, não por config: é o mesmo dado
 * que o servidor usa para decidir servir o manifest, então as duas pontas
 * concordam por construção.
 */
export default defineNuxtPlugin(() => {
  if (!isAdminHost(window.location.hostname)) return

  const estado = usePwaUpdate()

  const atualizar = registerSW({
    immediate: true,
    onNeedRefresh() {
      // Há versão nova esperando. Não troca sozinho: `skipWaiting` está
      // desligado justamente para não trocar o código embaixo de um formulário
      // aberto. Quem decide é a pessoa, pelo aviso na tela.
      estado.temAtualizacao.value = true
    },
    onRegisterError(erro: unknown) {
      // Falha de registro não pode quebrar o painel: sem SW ele funciona
      // igual, só perde o carregamento a partir do cache.
      console.error('[pwa] falha ao registrar o service worker', erro)
    },
  })

  estado.aplicarAtualizacao = async () => {
    estado.temAtualizacao.value = false
    // `true` recarrega a página assim que o SW novo assume.
    await atualizar(true)
  }
})
