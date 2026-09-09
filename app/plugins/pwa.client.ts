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

  configurarInstalacao()
})

/**
 * O evento que permite instalar dispara UMA vez, logo depois do load, e some
 * se ninguém o segurar — por isso isto vive no plugin e não no componente do
 * botão, que só monta depois.
 */
function configurarInstalacao() {
  const instalacao = usePwaInstall()

  // Rodando em janela própria: já está instalado, não há o que oferecer.
  const emJanelaPropria =
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS não implementa display-mode: standalone; usa esta propriedade só dele.
    (window.navigator as { standalone?: boolean }).standalone === true

  if (emJanelaPropria) {
    instalacao.instalado.value = true
    return
  }

  /**
   * iPad com iPadOS 13+ se apresenta como Macintosh no user agent. A tela de
   * toque é o que separa um do outro — sem isso, o iPad ficaria sem instrução
   * nenhuma, já que o Safari também não dispara `beforeinstallprompt` lá.
   */
  const ua = window.navigator.userAgent
  const ehIos =
    /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && window.navigator.maxTouchPoints > 1)

  let evento: (Event & { prompt: () => Promise<void> }) | null = null

  window.addEventListener('beforeinstallprompt', (e) => {
    // Sem isto o Chrome mostra o próprio convite, e passam a existir dois
    // caminhos para a mesma coisa em momentos que não controlamos.
    e.preventDefault()
    evento = e as Event & { prompt: () => Promise<void> }
    instalacao.podeInstalar.value = true
  })

  // Instalou: some com as duas ofertas sem esperar recarregar a página.
  window.addEventListener('appinstalled', () => {
    instalacao.instalado.value = true
    instalacao.podeInstalar.value = false
    instalacao.somenteInstrucao.value = false
  })

  // No iOS o evento nunca vem, então a instrução escrita é o único caminho.
  if (ehIos) instalacao.somenteInstrucao.value = true

  instalacao.instalar = async () => {
    if (!evento) return
    await evento.prompt()
    // O evento serve uma vez só: depois de usado, o botão sai da tela. Se a
    // pessoa recusar, o navegador dispara de novo numa visita futura.
    evento = null
    instalacao.podeInstalar.value = false
  }
}
