/**
 * Endereço antigo do feed dos portais, sem token.
 *
 * Ele nunca funcionou no Canal Pro (faltava CEP e rua em todo anúncio), e o
 * novo carrega endereço — por isso não pode continuar aberto aqui. 410 em vez
 * de 404 para que quem abrir no navegador, ou o suporte olhando o relatório do
 * portal, entenda que o link mudou e onde pegar o novo.
 */
export default defineEventHandler((event) => {
  setResponseStatus(event, 410, 'Gone')
  setHeader(event, 'content-type', 'text/plain; charset=utf-8')
  setHeader(event, 'cache-control', 'no-store')
  return 'Este endereço do feed de imóveis foi desativado. Pegue o link novo no painel, em Configurações > Integrações com portais, e cole no Canal Pro.\n'
})
