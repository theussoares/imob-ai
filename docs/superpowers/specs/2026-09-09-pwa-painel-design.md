# PWA do painel: instalável no celular e no computador

**Data:** 2026-09-09
**Motivo:** o painel é aberto como aba de navegador. Instalado, ele ganha ícone
na tela inicial / na barra de tarefas, abre em janela própria (sem barra de
URL) e carrega o shell do disco em vez da rede.

O trabalho é menor do que parece porque duas decisões antigas já pavimentaram o
caminho:

1. **`painel.<domínio>` serve exclusivamente o admin.** A convenção está em
   [tenant.ts:26](../../../server/utils/tenant.ts) e é aplicada por
   [admin-host.ts](../../../server/middleware/admin-host.ts), que redireciona
   toda rota pública desse host para `/admin`.
2. **`/admin` já é `ssr: false`** ([nuxt.config.ts:92](../../../nuxt.config.ts)),
   ou seja, já é uma SPA com shell estável — que é exatamente o que um service
   worker sabe pré-cachear.

Isso resolve de graça o problema mais chato de um PWA parcial. Manifest e
service worker são **por origem**, não por pasta: a orientação do
[web.dev sobre PWAs multi-origem](https://web.dev/multi-origin-pwas/) é que cada
origem precisa do próprio manifest, com `start_url` relativo a si mesma. Como a
plataforma já isolou o painel num host, o escopo do service worker é `/` naquela
origem e o PWA nasce restrito ao painel sem escopo parcial.

## Escopo

Instalação e carregamento rápido do painel, em desktop e mobile:

- manifest servido por host, com nome e cor do cliente;
- service worker pré-cacheando o shell da SPA;
- aviso de "nova versão disponível" quando houver deploy;
- botão de instalar dentro do painel, para o caso de o navegador não oferecer.

**Fora do escopo, por decisão:**

- **Funcionar offline — de dados e de abertura.** Trabalhar offline com dados é
  um projeto à parte: fila de escrita, resolução de conflito e um modelo de "o
  que é verdade" enquanto não há rede. O painel é um CRM com Realtime, dois
  corretores no mesmo lead é caso normal, e resolver isso mal é pior que não
  ter.

  **Nem abrir offline entra no v1**, e isso foi descoberto medindo, não
  decidido antes: o build não emite HTML nenhum (`ssr: false` faz o shell da
  SPA ser renderizado a cada requisição), então não há documento para o
  `navigateFallback` do Workbox servir. Daria para prerenderizar `/admin` e
  precachear esse shell, mas aí ele passaria a ser servido como arquivo
  estático e o `render:html` de `pwa-head.ts` — que injeta o manifest conforme
  o host — deixaria de rodar. Trocar a instalação por cliente pela abertura
  offline é um mau negócio.

  Sem rede, o painel mostra a tela de offline do navegador. O que o v1 entrega
  é instalação e carregamento a partir do cache quando há rede.
- **PWA no site público.** Não foi pedido, e cachear catálogo em site
  multi-tenant tem risco assimétrico: um shell errado servido no domínio de um
  cliente é prejuízo comercial dele, não nosso.
- **Ícone por cliente.** O manifest exige PNG real em 192 e 512
  ([critérios de instalação](https://www.digitalapplied.com/blog/progressive-web-apps-2026-complete-development-guide)),
  e `logo_url` tem proporção arbitrária — usar direto dá ícone torto ou cortado.
  Nome e cor já são por cliente; o ícone entra quando houver geração de imagem no
  servidor.
- **Notificações push.** Exige VAPID, backend de envio e um pedido de permissão
  que, feito cedo, queima a chance de pedir de novo.
- **Instalar por `dominio.com.br/admin`.** Exigiria escopar o service worker em
  `/admin/` dentro do domínio público, onde mora o site do cliente. O ganho
  (quem tem o endereço antigo salvo) não paga o risco de um SW do painel
  interferindo no catálogo.

## Decisões e o porquê

| Decisão | Alternativa descartada | Motivo |
|---|---|---|
| PWA só na origem `painel.<domínio>` | escopar o SW em `/admin/` no domínio público | manifest e SW são por origem; a plataforma já isola o painel por host |
| manifest gerado por host, em rota Nitro | arquivo estático no `public/` | `start_url` precisa ser relativo à própria origem, e um arquivo só não serve N domínios; por host, nome e cor do cliente saem de graça |
| ícone genérico da plataforma | ícone derivado do logo do cliente | ver "fora do escopo" |
| `registerType: 'prompt'` | `autoUpdate` | recarregar sozinho no meio de um cadastro perde o formulário preenchido |
| pré-cachear só o shell | cachear respostas de API | o painel é dado autenticado e multi-tenant: resposta cacheada vaza entre sessões e serve dado velho de CRM |
| botão de instalar no painel | confiar no convite do navegador | o convite do Chrome é discreto e o Safari no iOS não tem convite nenhum — lá só existe "Adicionar à Tela de Início" no menu |

## Riscos

Em ordem de estrago:

1. **Shell velho depois de um deploy.** É o modo de falha clássico de service
   worker: o SW serve do cache um shell que já não combina com a API, e a pessoa
   vê uma tela quebrada que não conserta com F5. É o motivo de `prompt` em vez de
   `autoUpdate`, e de o denylist de navegação excluir `/api/`.
2. **Cache encostando em autenticação.** Nada de `/api/` nem de `*.supabase.co`
   entra em cache. A sessão vive em `localStorage` por origem — o mesmo motivo
   pelo qual [00-canonical-host.ts:30](../../../server/middleware/00-canonical-host.ts)
   nunca redireciona o painel, depois de um incidente real de cliente deslogada.
3. **Nuxt 4 versus o módulo.** `@vite-pwa/nuxt` está na 1.1.1 (06/02/2026) e
   declara `@nuxt/kit ^3.9.0`; a documentação fala em Nuxt 3 e há relato de
   comunidade penando com Nuxt 4. Este projeto é Nuxt 4.5.2. **Primeiro passo da
   implementação é provar que builda** — antes de qualquer código em cima.
4. **CSP.** `default-src 'self'` sem `worker-src` explícito. Pela spec,
   `worker-src` cai para `script-src` e depois `default-src`, então um SW
   same-origin deve passar — mas isso é para verificar no navegador, não para
   assumir.
5. **Tenant sem domínio próprio.** `painel.<domínio>` resolve tirando o prefixo
   ([tenant.ts:93](../../../server/utils/tenant.ts)). Para quem está em
   `slug.usemoradi.com.br`, o host seria `painel.slug.usemoradi.com.br` — a
   resolução por subdomínio precisa ser verificada nesse formato.

## Fases

1. **Provar o terreno.** Instalar o módulo, subir um manifest mínimo, confirmar
   que builda no Nuxt 4 e que o SW registra sob a CSP atual.
2. **Manifest por host.** Rota Nitro devolvendo `manifest.webmanifest` com nome
   e `theme_color` do tenant; só em host de painel.
3. **Service worker.** Precache do shell, denylist de `/api/`, aviso de nova
   versão.
4. **Instalação.** Botão no painel usando `beforeinstallprompt`, com instrução
   escrita para iOS, que não tem esse evento.
